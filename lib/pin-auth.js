// 院ID・院PASS ＋ 個人PASS（数字4桁）のログイン
//
//   1. 院ID と 院PASS（4桁）を入力 → その院のスタッフ名の一覧が出る
//   2. 自分の名前を選び、個人PASS（4桁）を入力 → ログイン（見られる範囲は等級で決まる）
//   社長・GM はこれまでどおりメールアドレスのログイン（Supabase）を使う。
//
// PASS は台帳の「ログイン設定」シートに保存し、社長・GM だけが管理画面で見る・再発行する。
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
      name: String(r[c["氏名"]] ?? "").trim(), pin: pinOf(r[c["PASS"]]),
      fails: Number(r[c["失敗回数"]]) || 0, lockedUntil: Number(r[c["ロック解除"]]) || 0,
    };
    if (type === "院" && entry.clinic) clinics.set(entry.clinic, entry);
    else if (type === "個人" && entry.name) people.set(normName(entry.name), entry);
  }
  return { clinics, people };
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

// 個人PASSの方式："surname"＝名字（漢字）でログイン（当面の運用）、"pin"＝数字4桁
export const PERSON_PASS_MODE = "surname";

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
