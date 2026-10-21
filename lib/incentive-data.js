// /api/incentive と /api/evaluation で共通の「シート読み込み」と「ログイン確認」

import { batchGet } from "./google-sheets.js";
import { buildModel } from "./incentive-calc.js";

const SUPABASE_URL = "https://dctlirxcwitcupaewiyt.supabase.co";
export const SALES_SHEET_ID = process.env.SALES_SHEET_ID || "1jLAM3pns-OG7GITplXUrbvY4QP8S9wuGrXcYqxrX6n4";
export const CAREER_SHEET_ID = process.env.CAREER_SHEET_ID || "14z1jqBVBgVYFyCFYHU6hMoJvwfJZRalP8WQfJtiMKzQ";

// シートの読み込みは数秒かかるので、1分間は同じ結果を使い回す（「最新に更新」で即読み直し）
const CACHE_MS = 60 * 1000;
let cache = null; // { at, model }

export async function loadModel(force) {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.model;
  const [[personalRows, clinicRows], [bmFormulaRows], [policyRows, payrollRows, evaluationRows]] = await Promise.all([
    batchGet(SALES_SHEET_ID, ["'個人'!A1:AA400", "'院'!A1:Q100"]),
    batchGet(SALES_SHEET_ID, ["'BM'!A1:J40"], "FORMULA"),
    batchGet(CAREER_SHEET_ID, ["'全社方針・人件費42%管理'!A1:I40", "'月次推移ダッシュボード'!A1:E14", "'全スタッフ評価詳細'!A1:L300"]),
  ]);
  const model = buildModel({ personalRows, clinicRows, bmFormulaRows, policyRows, payrollRows, evaluationRows });
  model.loadedAt = new Date().toISOString();
  cache = { at: Date.now(), model };
  return model;
}

export function invalidateModel() {
  cache = null;
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

// リクエストのログイン情報を確認し、clinic_staff の行を返す。失敗時はレスポンスを返して null
export async function authenticate(req, res) {
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
