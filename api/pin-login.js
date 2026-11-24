// Vercel Serverless Function: /api/pin-login
// 個人ID・個人PASSでのログインと、その管理（社長・GMのみ）。
//
//   POST { action: "login", id, pass }                     … 個人IDと個人PASSを確認 → ログインのトークン（12時間）
//   GET                                                     … 社長・GM：全員の個人ID・個人PASSの一覧
//   POST { action: "generate" }                             … 社長・GM：まだ無い人の個人ID・PASSをまとめて作成
//   POST { action: "reissue", personKey }                   … 社長・GM：個人PASSを再発行（ロックも解除。IDは同じ）
//   以前の「院ID・院PASS → 名前 → 名字」のログイン（action: "clinic" / "person"）は 2026-11-17 に終了

import { batchUpdate, getSheetTitles, addSheets, appendRows } from "../lib/google-sheets.js";
import { normName, resolveViewer } from "../lib/incentive-calc.js";
import { CAREER_SHEET_ID, loadModel, loadLoginSheet, invalidateLoginSheet, authenticate } from "../lib/incentive-data.js";
import {
  LOGIN_SHEET, LOGIN_HEADER, MAX_FAILS, LOCK_MINUTES, loginRow, loginPeople, isLocked, afterAttempt, issueToken, pinStamp,
  PERSON_PASS_MODE, randomPassword, isPersonPassword, samePassword, planPersonLogins,
} from "../lib/pin-auth.js";

const nowJst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16);

async function writeEntry(entry) {
  await batchUpdate(CAREER_SHEET_ID, [{ range: `'${LOGIN_SHEET}'!A${entry.row}:H${entry.row}`, values: [loginRow(entry, nowJst())] }], "RAW");
  invalidateLoginSheet();
}

const lockMessage = (e) => `入力を${MAX_FAILS}回まちがえたため、ロック中です。${new Date(e.lockedUntil + 9 * 3600 * 1000).toISOString().slice(11, 16)}以降にもう一度お試しください（すぐ使うときは社長・GMにPASSの再発行を依頼してください）`;
const WRONG = "個人IDまたは個人PASSが違います";

// 個人IDと個人PASS → ログインのトークン（12時間）
async function personLogin(body) {
  const id = String(body.id || "").trim().toLowerCase();
  const sheet = await loadLoginSheet(true);
  const entry = id && sheet.byId.get(id);
  if (!entry) throw Object.assign(new Error(WRONG), { status: 401 });
  if (isLocked(entry)) throw Object.assign(new Error(lockMessage(entry)), { status: 429 });
  const ok = samePassword(entry.pin, body.pass);
  const next = afterAttempt(entry, ok);
  if (next.fails !== entry.fails || next.lockedUntil !== entry.lockedUntil) await writeEntry(next);
  if (!ok) throw Object.assign(new Error(isLocked(next) ? lockMessage(next) : WRONG), { status: 401 });
  // 台帳から外れた人（退職など）は入れない
  const key = normName(entry.name);
  const model = await loadModel();
  const person = loginPeople(model).find((p) => p.key === key);
  if (!person) throw Object.assign(new Error("このIDは今は使えません（台帳にいない・GMはメールアドレスでログイン）。社長・GMに確認してください"), { status: 403 });
  return { token: issueToken({ t: "person", k: key, n: person.name, h: pinStamp(entry.pin) }), name: person.name };
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
  const clinics = model.clinics.map((c) => ({
    name: c.name,
    staff: people.filter((p) => p.clinics[0] === c.name || (!model.clinics.some((x) => x.name === p.clinics[0]) && p.clinics.includes(c.name))).map((p) => {
      const pe = sheet.people.get(p.key);
      const ready = pe && pe.clinicId && isPersonPassword(pe.pin);
      return { key: p.key, name: p.name, grade: p.grade, role: p.role, clinics: p.clinics, id: ready ? pe.clinicId : null, pass: ready ? pe.pin : null, locked: isLocked(pe) };
    }),
  }));
  const missing = people.filter((p) => { const pe = sheet.people.get(p.key); return !(pe && pe.clinicId && isPersonPassword(pe.pin)); }).length;
  return { sheetExists: sheet.exists, clinics, missing, personPassMode: PERSON_PASS_MODE, maxFails: MAX_FAILS, lockMinutes: LOCK_MINUTES };
}

// まだ個人ID・個人PASSが無い人（以前の4桁・名字の人を含む）に作成する。作成済みの人は変えない
async function generate(model) {
  const titles = await getSheetTitles(CAREER_SHEET_ID);
  if (!titles.includes(LOGIN_SHEET)) {
    await addSheets(CAREER_SHEET_ID, [LOGIN_SHEET]);
    await batchUpdate(CAREER_SHEET_ID, [{ range: `'${LOGIN_SHEET}'!A1:H1`, values: [LOGIN_HEADER] }], "RAW");
  }
  invalidateLoginSheet();
  const sheet = await loadLoginSheet(true);
  const appends = [], updates = [];
  for (const { person: p, entry: pe, id, pass } of planPersonLogins(sheet, loginPeople(model), model.clinics.map((c) => c.name))) {
    const entry = { ...(pe || {}), type: "個人", clinic: p.clinics.join("・"), clinicId: id, name: p.name, pin: pass, fails: 0, lockedUntil: 0 };
    if (pe) updates.push({ range: `'${LOGIN_SHEET}'!A${pe.row}:H${pe.row}`, values: [loginRow(entry, nowJst())] });
    else appends.push(loginRow(entry, nowJst()));
  }
  if (updates.length) await batchUpdate(CAREER_SHEET_ID, updates, "RAW");
  if (appends.length) await appendRows(CAREER_SHEET_ID, `'${LOGIN_SHEET}'!A:H`, appends);
  invalidateLoginSheet();
  return updates.length + appends.length;
}

// 個人PASSの再発行（IDは同じ。ロックも解除）。まだIDが無い人は「まとめて作成」で作る
async function reissue(body) {
  const sheet = await loadLoginSheet(true);
  const entry = sheet.people.get(normName(body.personKey));
  if (!entry || !entry.clinicId || !isPersonPassword(entry.pin)) throw new Error("この人の個人IDがまだありません。先に「まとめて作成」を押してください");
  await writeEntry({ ...entry, pin: randomPassword(), fails: 0, lockedUntil: 0 });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const action = req.method === "POST" ? (req.body || {}).action : null;
    if (action === "login") {
      res.status(200).json(await personLogin(req.body));
      return;
    }
    if (action === "clinic" || action === "person") {
      res.status(410).json({ error: "ログインの方法が変わりました。画面を再読み込みして、個人IDと個人PASSでログインしてください" });
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
