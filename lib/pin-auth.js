// 個人ID・個人PASS のログイン（2026-11-17 から。それまでは「院ID・院PASS → 名前 → 名字」）
//
//   スタッフ・院長・BM は、一人ひとりの 個人ID（例：korien01）と 個人PASS（英小文字と数字の8文字）でログインする。
//   見られる範囲は等級で決まる（評価・マニュアルのクラス別の制限もこの本人で判定する）。
//   社長・GM はこれまでどおりメールアドレスのログイン（Supabase）を使う。
//
// ID・PASS は台帳の「ログイン設定」シートに保存し（個人の行の「院ID」の列に個人IDを入れる）、
// 社長・GM だけが管理画面で見る・作成する・再発行する。
// 5回まちがえると15分ロック。PASS を再発行すると、その人の古いログインは使えなくなる。

import crypto from "node:crypto";
import { normName } from "./incentive-calc.js";

export const LOGIN_SHEET = "ログイン設定";
export const LOGIN_HEADER = ["種類", "院", "院ID", "氏名", "PASS", "失敗回数", "ロック解除", "更新日時"];
export const MAX_FAILS = 5;
export const LOCK_MINUTES = 15;
const SESSION_HOURS = 12;

// 院名 → 院ID（ローマ字）。一覧に無い院は clinic1, clinic2…
const CLINIC_IDS = { 枚方: "hirakata", 田口山: "taguchiyama", 交野: "katano", 茨木: "ibaraki", 津田: "tsuda", 大和田: "owada", 香里園: "korien" };
export function clinicIdOf(name, index = 0) {
  return CLINIC_IDS[name] || `clinic${index + 1}`;
}

// 個人PASS：英小文字と数字の8文字（読み間違えやすい i・l・o・0・1 は使わない）
const PASS_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
export const PASS_LENGTH = 8;
export function randomPassword() {
  for (;;) {
    let out = "";
    for (let i = 0; i < PASS_LENGTH; i++) out += PASS_CHARS[crypto.randomInt(0, PASS_CHARS.length)];
    if (/[a-z]/.test(out) && /\d/.test(out)) return out; // 英字と数字を両方ふくむ
  }
}
export const isPersonPassword = (v) => typeof v === "string" && v.length >= PASS_LENGTH;

// 個人ID：主な院の院ID ＋ 2けたの番号（例：korien01）。すでに使われている番号は飛ばす
export function nextPersonId(clinicName, clinicIndex, used) {
  const base = clinicIdOf(clinicName, clinicIndex);
  for (let n = 1; ; n++) {
    const id = `${base}${String(n).padStart(2, "0")}`;
    if (!used.has(id)) return id;
  }
}

// まだ個人ID・PASSが無い人（以前の4桁・名字・空の人を含む）に作る分を決める。作成済みの人は変えない
//   sheet：parseLoginSheet の結果、people：ログインできる人（loginPeople）、clinicNames：院の並び（院IDの番号用）
//   → [{ person, entry（既存の行 or null）, id, pass }]
export function planPersonLogins(sheet, people, clinicNames) {
  const used = new Set([...sheet.people.values()].map((e) => e.clinicId).filter(Boolean));
  for (const c of sheet.clinics.values()) used.add(c.clinicId); // 院IDと同じ文字は使わない
  const out = [];
  for (const p of people) {
    const pe = sheet.people.get(p.key);
    if (pe && pe.clinicId && isPersonPassword(pe.pin)) continue;
    const id = pe && pe.clinicId ? pe.clinicId : nextPersonId(p.clinics[0], Math.max(0, clinicNames.indexOf(p.clinics[0])), used);
    used.add(id);
    out.push({ person: p, entry: pe || null, id, pass: randomPassword() });
  }
  return out;
}

// 推測されやすい番号（0000・1111・1234・4321 など）は使わない
export function randomPin() {
  for (;;) {
    const pin = String(crypto.randomInt(0, 10000)).padStart(4, "0");
    if (/^(\d)\1{3}$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) continue;
    return pin;
  }
}

const pinOf = (v) => (v === null || v === undefined || v === "" ? "" : String(v).replace(/\D/g, "").padStart(4, "0").slice(-4));

// 「ログイン設定」シート → { clinics: Map(院名 → 行), people: Map(氏名key → 行) }
export function parseLoginSheet(rows) {
  const clinics = new Map(), people = new Map();
  if (!rows || rows.length < 2) return { clinics, people };
  const head = rows[0].map(normName);
  const c = Object.fromEntries(LOGIN_HEADER.map((h) => [h, head.indexOf(normName(h))]));
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const type = String(r[c["種類"]] ?? "").trim();
    const entry = {
      row: i + 1, type, clinic: String(r[c["院"]] ?? "").trim(), clinicId: String(r[c["院ID"]] ?? "").trim().toLowerCase(),
      name: String(r[c["氏名"]] ?? "").trim(),
      // 院PASS は数字4桁。個人PASS は8文字（以前の4桁・空のものは「未作成」として作り直す）
      pin: type === "個人" ? String(r[c["PASS"]] ?? "").trim() : pinOf(r[c["PASS"]]),
      fails: Number(r[c["失敗回数"]]) || 0, lockedUntil: Number(r[c["ロック解除"]]) || 0,
    };
    if (type === "院" && entry.clinic) clinics.set(entry.clinic, entry);
    else if (type === "個人" && entry.name) people.set(normName(entry.name), entry);
  }
  // 個人ID → 行（ログインのとき ID から本人を探す）
  const byId = new Map([...people.values()].filter((e) => e.clinicId && isPersonPassword(e.pin)).map((e) => [e.clinicId, e]));
  return { clinics, people, byId };
}

export function loginRow(e, now) {
  return [e.type, e.clinic, e.clinicId, e.name, e.pin, e.fails || 0, e.lockedUntil || "", now];
}

// ログインできる人: 院に所属している人（GM は除く。GM はメールアドレスでログイン）
export function loginPeople(model) {
  return model.people.filter((p) => p.clinics.length && p.grade !== "G6");
}

export function isLocked(entry, now = Date.now()) {
  return entry && entry.lockedUntil && entry.lockedUntil > now;
}

// 失敗したら回数を増やし、上限でロック。成功したら回数を戻す
export function afterAttempt(entry, ok, now = Date.now()) {
  if (ok) return { ...entry, fails: 0, lockedUntil: 0 };
  const fails = (entry.fails || 0) + 1;
  if (fails >= MAX_FAILS) return { ...entry, fails: 0, lockedUntil: now + LOCK_MINUTES * 60 * 1000 };
  return { ...entry, fails };
}

// ===== ログインの印（トークン） =====
function secret() {
  const s = process.env.PIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("サーバー側に PIN_SESSION_SECRET（または SUPABASE_SERVICE_ROLE_KEY）が設定されていません");
  return s;
}
const b64 = (s) => Buffer.from(s).toString("base64url");
const sign = (body) => crypto.createHmac("sha256", secret()).update(body).digest("base64url");
// PASS を再発行したら古いトークンが通らないように、PASS から作った短い印を入れる
export const pinStamp = (pin) => crypto.createHmac("sha256", secret()).update(`pin:${pin}`).digest("base64url").slice(0, 10);

export function issueToken(payload, hours = SESSION_HOURS) {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + hours * 3600 * 1000 }));
  return `${body}.${sign(body)}`;
}

export function verifyToken(token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

// 個人PASSの方式："password"＝個人ID＋8文字のPASS（2026-11-17 から）。以前は "surname"（名字）
export const PERSON_PASS_MODE = "password";

// 8文字のPASSの比較（時間差で推測されないように）
export function samePassword(a, b) {
  const x = Buffer.from(String(a ?? "")), y = Buffer.from(String(b ?? "").trim());
  return x.length >= PASS_LENGTH && x.length === y.length && crypto.timingSafeEqual(x, y);
}

// 名字（「定井 彪雅」→「定井」。空白が無い名前はそのまま）
export function surnameOf(name) {
  return String(name ?? "").trim().split(/[\s　]+/)[0] || "";
}

// 入力が名字と合うか（空白の有無・前後の空白は無視。フルネームでもOK）
export function sameSurname(name, input) {
  // パスワード欄ではないので日本語で入力できる。全角・半角の違いもそろえる
  const norm = (v) => String(v ?? "").normalize("NFKC").replace(/\s+/g, "");
  const x = norm(input);
  if (!x) return false;
  const cands = [norm(surnameOf(name)), norm(name)];
  return cands.some((c) => c && Buffer.byteLength(c) === Buffer.byteLength(x) && crypto.timingSafeEqual(Buffer.from(c), Buffer.from(x)));
}

// 4桁の比較（時間差で推測されないように）
export function samePin(a, b) {
  const x = Buffer.from(pinOf(a)), y = Buffer.from(pinOf(b));
  return x.length === 4 && y.length === 4 && crypto.timingSafeEqual(x, y);
}
