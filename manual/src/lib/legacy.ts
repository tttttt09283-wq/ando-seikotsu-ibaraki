// 予約管理と同じログイン・台帳を使うための橋渡し（リポジトリ直下の lib/ をそのまま使う）。
// 院ID＋院PASS → 名前を選ぶ → 個人PASS の流れと、まちがえたときのロックは api/pin-login.js と同じ。
import "server-only";
// @ts-ignore 型定義のない JS
import * as pin from "../../../lib/pin-auth.js";
// @ts-ignore 型定義のない JS
import { CAREER_SHEET_ID, loadModel, loadLoginSheet, invalidateLoginSheet } from "../../../lib/incentive-data.js";
// @ts-ignore 型定義のない JS
import { normName as legacyNormName } from "../../../lib/incentive-calc.js";
// @ts-ignore 型定義のない JS
import { batchUpdate } from "../../../lib/google-sheets.js";

export const SUPABASE_URL = process.env.SUPABASE_URL || "https://dctlirxcwitcupaewiyt.supabase.co";

export const normName = (s: string): string => legacyNormName(s);

type LoginEntry = { row: number; type: string; clinic: string; clinicId: string; name: string; pin: string; fails: number; lockedUntil: number };
type LedgerPerson = { key: string; name: string; clinics: string[]; grade: string; role: string };

class LoginError extends Error {}
const fail = (m: string): never => { throw new LoginError(m); };

const nowJst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16);
async function writeEntry(entry: LoginEntry) {
  await batchUpdate(CAREER_SHEET_ID, [{ range: `'${pin.LOGIN_SHEET}'!A${entry.row}:H${entry.row}`, values: [pin.loginRow(entry, nowJst())] }], "RAW");
  invalidateLoginSheet();
}
const lockMessage = (e: LoginEntry) =>
  `入力を${pin.MAX_FAILS}回まちがえたため、ロック中です。${new Date(e.lockedUntil + 9 * 3600 * 1000).toISOString().slice(11, 16)}以降にもう一度お試しください`;

export async function ledgerPeople(force = false): Promise<LedgerPerson[]> {
  const model = await loadModel(force);
  return model.people as LedgerPerson[];
}

// 1. 院ID と 院PASS → その院のスタッフ名の一覧
export async function clinicStep(id: string, pass: string) {
  const sheet = await loadLoginSheet(true);
  const entry = ([...sheet.clinics.values()] as LoginEntry[]).find((c) => c.clinicId === id.trim().toLowerCase());
  if (!entry) fail("院IDまたは院PASSが違います");
  const e = entry as LoginEntry;
  if (pin.isLocked(e)) fail(lockMessage(e));
  const ok = pin.samePin(e.pin, pass);
  const next = pin.afterAttempt(e, ok) as LoginEntry;
  if (next.fails !== e.fails || next.lockedUntil !== e.lockedUntil) await writeEntry(next);
  if (!ok) fail(pin.isLocked(next) ? lockMessage(next) : "院IDまたは院PASSが違います");
  const model = await loadModel();
  const bySurname = pin.PERSON_PASS_MODE === "surname";
  const staff = (pin.loginPeople(model) as LedgerPerson[])
    .filter((p) => p.clinics.includes(e.clinic) && (bySurname || sheet.people.has(p.key)))
    .map((p) => ({ key: p.key, name: p.name }));
  return { clinic: e.clinic as string, staff, clinicToken: pin.issueToken({ t: "clinic", c: e.clinic }, 0.5) as string };
}

// 2. 名前と個人PASS → 本人の確認。戻り値はマニュアルのログインに入れる印
export async function personStep(clinicToken: string, personKey: string, pass: string) {
  const ct = pin.verifyToken(clinicToken);
  if (!ct || ct.t !== "clinic") fail("時間が経ったので、院IDからやり直してください");
  const key = normName(personKey);
  const model = await loadModel();
  const person = (pin.loginPeople(model) as LedgerPerson[]).find((p) => p.key === key && p.clinics.includes(ct.c));
  const sheet = await loadLoginSheet(true);
  const entry = person ? (sheet.people.get(key) as LoginEntry | undefined) : undefined;
  const bySurname = pin.PERSON_PASS_MODE === "surname";
  if (!person || (!entry && !bySurname)) fail("名前またはPASSが違います");
  if (entry && pin.isLocked(entry)) fail(lockMessage(entry));
  const ok = bySurname ? pin.sameSurname(person!.name, pass) : pin.samePin(entry!.pin, pass);
  const next = entry ? (pin.afterAttempt(entry, ok) as LoginEntry) : null;
  if (entry && next && (next.fails !== entry.fails || next.lockedUntil !== entry.lockedUntil)) await writeEntry(next);
  if (!ok) fail(next && pin.isLocked(next) ? lockMessage(next) : "名前またはPASSが違います");
  return { key, name: person!.name, stamp: entry ? (pin.pinStamp(entry.pin) as string) : "" };
}

// 院ID＋個人PASSのログインが今も有効か（PASSが再発行されていないか）。台帳の読み込みは30秒使い回す
export async function pinSessionStillValid(key: string, stamp: string): Promise<boolean> {
  const sheet = await loadLoginSheet();
  const entry = sheet.people.get(key) as LoginEntry | undefined;
  if (entry) return pin.pinStamp(entry.pin) === stamp;
  return !stamp && pin.PERSON_PASS_MODE === "surname";
}

export function isLoginError(e: unknown): e is Error {
  return e instanceof LoginError;
}

// ===== メールアドレスのログイン（Supabase Auth） =====
const anonKey = () => process.env.SUPABASE_ANON_KEY || "";
const serviceKey = () => {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error("サーバー側に SUPABASE_SERVICE_ROLE_KEY が設定されていません");
  return k;
};

export async function emailPasswordLogin(email: string, password: string): Promise<{ uid: string; staff: { id: number; name: string; role: string } | null }> {
  if (!anonKey()) throw new Error("サーバー側に SUPABASE_ANON_KEY が設定されていません");
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  if (!r.ok) fail("メールアドレスまたはパスワードが違います");
  const j = (await r.json()) as { user?: { id?: string } };
  const uid = j.user?.id;
  if (!uid) fail("メールアドレスまたはパスワードが違います");
  const s = await fetch(`${SUPABASE_URL}/rest/v1/clinic_staff?auth_uid=eq.${encodeURIComponent(uid!)}&select=id,name,role`, {
    headers: { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}` },
    cache: "no-store",
  });
  if (!s.ok) throw new Error("スタッフ台帳（clinic_staff）を確認できませんでした");
  const rows = (await s.json()) as { id: number; name: string; role: string }[];
  return { uid: uid!, staff: rows[0] ?? null };
}

// 退職時：予約管理を含めて Supabase のログインを止める
export async function banAuthUser(uid: string) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(uid)}`, {
    method: "PUT",
    headers: { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ban_duration: "876000h" }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Supabase のログイン停止に失敗しました（${r.status}）`);
}
