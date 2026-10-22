// Vercel Serverless Function: /api/pin-login
// 院ID・院PASS ＋ 個人PASS（数字4桁）でのログインと、その管理（社長・GMのみ）。
//
//   POST { action: "clinic", id, pass }                       … 院IDと院PASSを確認 → その院のスタッフ名一覧
//   POST { action: "person", clinicToken, personKey, pin }    … 個人PASS（当面は名字）を確認 → ログインのトークン
//   GET                                                       … 社長・GM：院ID・PASS・個人PASSの一覧
//   POST { action: "generate" }                               … 社長・GM：まだ無い院・人のPASSをまとめて作成
//   POST { action: "reissue", kind: "院"|"個人", clinic, personKey } … 社長・GM：PASSを再発行（ロックも解除）

import { batchUpdate, getSheetTitles, addSheets, appendRows } from "../lib/google-sheets.js";
import { normName, resolveViewer } from "../lib/incentive-calc.js";
import { CAREER_SHEET_ID, loadModel, loadLoginSheet, invalidateLoginSheet, authenticate } from "../lib/incentive-data.js";
import {
  LOGIN_SHEET, LOGIN_HEADER, MAX_FAILS, LOCK_MINUTES, clinicIdOf, randomPin, loginRow, loginPeople,
  isLocked, afterAttempt, issueToken, verifyToken, pinStamp, samePin, PERSON_PASS_MODE, surnameOf, sameSurname,
} from "../lib/pin-auth.js";
const BY_SURNAME = PERSON_PASS_MODE === "surname";

const nowJst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16);

async function writeEntry(entry) {
  await batchUpdate(CAREER_SHEET_ID, [{ range: `'${LOGIN_SHEET}'!A${entry.row}:H${entry.row}`, values: [loginRow(entry, nowJst())] }], "RAW");
  invalidateLoginSheet();
}

const lockMessage = (e) => `入力を${MAX_FAILS}回まちがえたため、ロック中です。${new Date(e.lockedUntil + 9 * 3600 * 1000).toISOString().slice(11, 16)}以降にもう一度お試しください（すぐ使うときは社長・GMにPASSの再発行を依頼してください）`;

// 院IDと院PASS → その院のスタッフ名一覧と、名前選択用の短いトークン
async function clinicLogin(body) {
  const id = String(body.id || "").trim().toLowerCase();
  const sheet = await loadLoginSheet(true);
  const entry = [...sheet.clinics.values()].find((c) => c.clinicId === id);
  if (!entry) throw Object.assign(new Error("院IDまたは院PASSが違います"), { status: 401 });
  if (isLocked(entry)) throw Object.assign(new Error(lockMessage(entry)), { status: 429 });
  const ok = samePin(entry.pin, body.pass);
  const next = afterAttempt(entry, ok);
  if (next.fails !== entry.fails || next.lockedUntil !== entry.lockedUntil) await writeEntry(next);
  if (!ok) throw Object.assign(new Error(isLocked(next) ? lockMessage(next) : "院IDまたは院PASSが違います"), { status: 401 });

  const model = await loadModel();
  const staff = loginPeople(model)
    .filter((p) => p.clinics.includes(entry.clinic) && (BY_SURNAME || sheet.people.has(p.key)))
    .map((p) => ({ key: p.key, name: p.name }));
  return { clinic: entry.clinic, staff, clinicToken: issueToken({ t: "clinic", c: entry.clinic }, 0.5) };
}

// 名前と個人PASS → ログインのトークン（12時間）
async function personLogin(body) {
  const ct = verifyToken(body.clinicToken);
  if (!ct || ct.t !== "clinic") throw Object.assign(new Error("時間が経ったので、院IDからやり直してください"), { status: 401 });
  const key = normName(body.personKey);
  const model = await loadModel();
  const person = loginPeople(model).find((p) => p.key === key && p.clinics.includes(ct.c));
  const sheet = await loadLoginSheet(true);
  const entry = person && sheet.people.get(key);
  // 名字でログインする間は、個人PASSの行が無い人も入れる（行があればロックの回数を記録する）
  if (!person || (!entry && !BY_SURNAME)) throw Object.assign(new Error("名前またはPASSが違います"), { status: 401 });
  if (entry && isLocked(entry)) throw Object.assign(new Error(lockMessage(entry)), { status: 429 });
  const ok = BY_SURNAME ? sameSurname(person.name, body.pin) : samePin(entry.pin, body.pin);
  const next = entry && afterAttempt(entry, ok);
  if (next && (next.fails !== entry.fails || next.lockedUntil !== entry.lockedUntil)) await writeEntry(next);
  if (!ok) throw Object.assign(new Error(next && isLocked(next) ? lockMessage(next) : "名前またはPASSが違います"), { status: 401 });
  return { token: issueToken({ t: "person", k: key, n: person.name, h: entry ? pinStamp(entry.pin) : "" }), name: person.name, clinic: ct.c };
}

// ===== 管理（社長・GM） =====
async function requireManager(req, res) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    res.status(403).json({ error: "ログイン設定は社長・GM（メールアドレスでログイン）のみ使えます" });
    return null;
  }
  const staff = await authenticate(req, res);
  if (!staff) return null;
  const model = await loadModel();
  const viewer = resolveViewer(model, staff);
  if (!(staff.role === "admin" || (viewer && viewer.grade === "G6"))) {
    res.status(403).json({ error: "ログイン設定は社長・GMのみ使えます" });
    return null;
  }
  return { staff, model };
}

async function listLogins(model) {
  const sheet = await loadLoginSheet(true);
  const people = loginPeople(model);
  const clinics = model.clinics.map((c, i) => {
    const e = sheet.clinics.get(c.name);
    return {
      name: c.name, clinicId: e ? e.clinicId : clinicIdOf(c.name, i), pass: e ? e.pin : null, locked: isLocked(e),
      staff: people.filter((p) => p.clinics.includes(c.name)).map((p) => {
        const pe = sheet.people.get(p.key);
        return { key: p.key, name: p.name, grade: p.grade, role: p.role, pin: BY_SURNAME ? surnameOf(p.name) : pe ? pe.pin : null, locked: isLocked(pe) };
      }),
    };
  });
  const missing = clinics.filter((c) => !c.pass).length + (BY_SURNAME ? 0 : new Set(clinics.flatMap((c) => c.staff.filter((s) => !s.pin).map((s) => s.key))).size);
  return { sheetExists: sheet.exists, clinics, missing, personPassMode: PERSON_PASS_MODE, maxFails: MAX_FAILS, lockMinutes: LOCK_MINUTES };
}

async function generate(model) {
  const titles = await getSheetTitles(CAREER_SHEET_ID);
  if (!titles.includes(LOGIN_SHEET)) {
    await addSheets(CAREER_SHEET_ID, [LOGIN_SHEET]);
    await batchUpdate(CAREER_SHEET_ID, [{ range: `'${LOGIN_SHEET}'!A1:H1`, values: [LOGIN_HEADER] }], "RAW");
  }
  invalidateLoginSheet();
  const sheet = await loadLoginSheet(true);
  const rows = [];
  const usedIds = new Set([...sheet.clinics.values()].map((c) => c.clinicId));
  model.clinics.forEach((c, i) => {
    if (sheet.clinics.has(c.name)) return;
    let id = clinicIdOf(c.name, i);
    while (usedIds.has(id)) id += "2";
    usedIds.add(id);
    rows.push(loginRow({ type: "院", clinic: c.name, clinicId: id, name: "", pin: randomPin() }, nowJst()));
  });
  for (const p of loginPeople(model)) {
    if (sheet.people.has(p.key)) continue;
    rows.push(loginRow({ type: "個人", clinic: p.clinics.join("・"), clinicId: "", name: p.name, pin: randomPin() }, nowJst()));
  }
  await appendRows(CAREER_SHEET_ID, `'${LOGIN_SHEET}'!A:H`, rows);
  invalidateLoginSheet();
  return rows.length;
}

async function reissue(body) {
  const sheet = await loadLoginSheet(true);
  const entry = body.kind === "院" ? sheet.clinics.get(String(body.clinic || "")) : sheet.people.get(normName(body.personKey));
  if (!entry) throw new Error("対象が見つかりません。先に「まとめて作成」を押してください");
  await writeEntry({ ...entry, pin: randomPin(), fails: 0, lockedUntil: 0 });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "POST" && (req.body || {}).action === "clinic") {
      res.status(200).json(await clinicLogin(req.body));
      return;
    }
    if (req.method === "POST" && (req.body || {}).action === "person") {
      res.status(200).json(await personLogin(req.body));
      return;
    }
    if (req.method !== "GET" && req.method !== "POST") {
      res.status(405).json({ error: "GET・POSTのみ対応しています" });
      return;
    }
    const mgr = await requireManager(req, res);
    if (!mgr) return;
    if (req.method === "POST") {
      const body = req.body || {};
      if (body.action === "generate") await generate(mgr.model);
      else if (body.action === "reissue") await reissue(body);
      else { res.status(400).json({ error: "action が正しくありません" }); return; }
    }
    res.status(200).json(await listLogins(mgr.model));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || String(e) });
  }
}
