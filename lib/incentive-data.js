// /api/incentive と /api/evaluation で共通の「シート読み込み」と「ログイン確認」

import { batchGet, getSheetTitles } from "./google-sheets.js";
import { buildModel, normName } from "./incentive-calc.js";
import { parseNewPatients } from "./new-patients.js";
import { LOGIN_SHEET, parseLoginSheet, verifyToken, pinStamp } from "./pin-auth.js";
import { EVENT_SHEET, parseEvents, attachEventsToModel } from "./events.js";

const SUPABASE_URL = "https://dctlirxcwitcupaewiyt.supabase.co";
export const SALES_SHEET_ID = process.env.SALES_SHEET_ID || "1jLAM3pns-OG7GITplXUrbvY4QP8S9wuGrXcYqxrX6n4";
export const CAREER_SHEET_ID = process.env.CAREER_SHEET_ID || "14z1jqBVBgVYFyCFYHU6hMoJvwfJZRalP8WQfJtiMKzQ";
export const NEWPATIENT_SHEET_ID = process.env.NEWPATIENT_SHEET_ID || "1sTcCqJEDSYRbupvG8YjSiJci_M-yJTtiPkw2NQ2QoKY";

// シートの読み込みは数秒かかるので、1分間は同じ結果を使い回す（「最新に更新」で即読み直し）
const CACHE_MS = 60 * 1000;
let cache = null; // { at, model }

export async function loadModel(force) {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.model;
  const careerTitles = await getSheetTitles(CAREER_SHEET_ID);
  const hasEvents = careerTitles.includes(EVENT_SHEET);
  const [[personalRows, clinicRows], [bmFormulaRows], [policyRows, payrollRows, evaluationRows, eventRows]] = await Promise.all([
    batchGet(SALES_SHEET_ID, ["'個人'!A1:AA400", "'院'!A1:Q100"]),
    batchGet(SALES_SHEET_ID, ["'BM'!A1:J40"], "FORMULA"),
    batchGet(CAREER_SHEET_ID, ["'全社方針・人件費42%管理'!A1:I40", "'月次推移ダッシュボード'!A1:E14", "'全スタッフ評価詳細'!A1:L300",
      ...(hasEvents ? [`'${EVENT_SHEET}'!A1:I3000`] : [])]),
  ]);
  const model = buildModel({ personalRows, clinicRows, bmFormulaRows, policyRows, payrollRows, evaluationRows });
  // 全社イベント：報酬を本人のインセンティブ欄と全社の42%枠に足す。一覧そのものは画面に送らない（enumerable: false）
  const events = parseEvents(eventRows || [], model.people);
  attachEventsToModel(model, events);
  Object.defineProperty(model, "events", { value: events, enumerable: false });
  model.loadedAt = new Date().toISOString();
  cache = { at: Date.now(), model };
  return model;
}

export function invalidateModel() {
  cache = null;
}

// 「あんど新規集客」シート（院ごとのタブ）を読み、スタッフ別・院別・月別の新患実績にする。
// 読めない（共有されていない等）ときは { error } を返し、評価画面は手入力のまま使えるようにする
let npCache = null; // { at, data }
export async function loadNewPatients(model, force) {
  if (!force && npCache && Date.now() - npCache.at < CACHE_MS) return npCache.data;
  let data;
  try {
    const titles = (await getSheetTitles(NEWPATIENT_SHEET_ID)).filter((t) => normName(t).endsWith("院"));
    const values = titles.length ? await batchGet(NEWPATIENT_SHEET_ID, titles.map((t) => `'${t.replace(/'/g, "''")}'!A1:Z3000`)) : [];
    data = parseNewPatients(Object.fromEntries(titles.map((t, i) => [t, values[i]])), model.people);
  } catch (e) {
    data = { error: `新規集客シートを読み込めませんでした（${e.message}）。サービスアカウントに「閲覧者」で共有してください`, byPerson: new Map(), byClinic: new Map(), unmatched: [] };
  }
  npCache = { at: Date.now(), data };
  return data;
}

// ログイン中ユーザーのトークンから clinic_staff の行（name・role）を取得する
async function getCallerStaff(callerToken, serviceKey) {
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${callerToken}` },
  });
  if (!userRes.ok) throw new Error("invalid token");
  const user = await userRes.json();
  if (!user || !user.id) throw new Error("invalid token");
  const staffRes = await fetch(
    `${SUPABASE_URL}/rest/v1/clinic_staff?auth_uid=eq.${encodeURIComponent(user.id)}&select=id,name,role`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!staffRes.ok) throw new Error("lookup failed");
  const rows = await staffRes.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

// 台帳の「ログイン設定」シート（院ID・PASS）。読み込みは30秒だけ使い回す
let loginCache = null; // { at, data }
export async function loadLoginSheet(force) {
  if (!force && loginCache && Date.now() - loginCache.at < 30 * 1000) return loginCache.data;
  const titles = await getSheetTitles(CAREER_SHEET_ID);
  const exists = titles.includes(LOGIN_SHEET);
  const [rows] = exists ? await batchGet(CAREER_SHEET_ID, [`'${LOGIN_SHEET}'!A1:H500`]) : [[]];
  const data = { exists, rowCount: rows.length, ...parseLoginSheet(rows) };
  loginCache = { at: Date.now(), data };
  return data;
}
export function invalidateLoginSheet() {
  loginCache = null;
}

// 個人PASSでログインした人（Authorization: Pin <トークン>）→ スタッフ扱いの行。だめなら null
async function staffFromPinToken(token) {
  const t = verifyToken(token);
  if (!t || t.t !== "person") return null;
  const sheet = await loadLoginSheet();
  const entry = sheet.people.get(t.k);
  if (entry ? pinStamp(entry.pin) !== t.h : t.h || !t.n) return null; // PASS が再発行された（名字ログインで行が無い人は名前で）
  return { id: null, name: entry ? entry.name : t.n, role: "staff", viaPin: true };
}

// リクエストのログイン情報を確認し、clinic_staff の行を返す。失敗時はレスポンスを返して null
//   Authorization: Bearer <Supabaseのトークン>（社長・GM・メールでログインした人）
//   Authorization: Pin <トークン>（院ID＋個人PASSでログインした人）
export async function authenticate(req, res) {
  const pinHeader = req.headers.authorization || "";
  if (pinHeader.startsWith("Pin ")) {
    let staff = null;
    try { staff = await staffFromPinToken(pinHeader.slice(4)); } catch (e) { staff = null; }
    if (!staff) {
      res.status(401).json({ error: "ログインの有効期限が切れたか、PASSが変更されました。ログインし直してください" });
      return null;
    }
    return staff;
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    res.status(500).json({ error: "サーバー側にSUPABASE_SERVICE_ROLE_KEYが設定されていません" });
    return null;
  }
  const authHeader = req.headers.authorization || "";
  const callerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!callerToken) {
    res.status(401).json({ error: "ログインしてから開いてください" });
    return null;
  }
  let staff;
  try {
    staff = await getCallerStaff(callerToken, serviceKey);
  } catch (e) {
    res.status(401).json({ error: "ログイン情報を確認できませんでした。ログインし直してください" });
    return null;
  }
  if (!staff) {
    res.status(403).json({ error: "スタッフ情報が見つかりませんでした" });
    return null;
  }
  return staff;
}

export function viewerNotFound(res, staff) {
  res.status(403).json({ error: `スプレッドシートに「${staff.name || ""}」さんが見つかりませんでした。管理者に、スタッフ名がシートの氏名と一致しているか確認してもらってください` });
}
