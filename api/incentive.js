// Vercel Serverless Function: /api/incentive
// 「進捗売上実績」と「キャリア制度・人件費42%管理台帳」の2つのスプレッドシートを読み、
// インセンティブ進捗・人件費42%枠・査定結果をまとめて返す。
//
// 給与・評価を含むため、ログイン中のスタッフを確認し、見てよい範囲だけ返す:
//   admin・GM(G6) → 全院 / BM → 担当ブロック / 院長(G4) → 自院 / それ以外 → 自分だけ
//
// 事前準備（Vercelの環境変数）:
//   SUPABASE_SERVICE_ROLE_KEY（既存）
//   GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY（lib/google-sheets.js 参照）
//   SALES_SHEET_ID / CAREER_SHEET_ID（任意。未設定なら下の既定のシートを読む）

import { batchGet } from "../lib/google-sheets.js";
import { buildModel, resolveViewer, filterModelForViewer } from "../lib/incentive-calc.js";

const SUPABASE_URL = "https://dctlirxcwitcupaewiyt.supabase.co";
const SALES_SHEET_ID = process.env.SALES_SHEET_ID || "1jLAM3pns-OG7GITplXUrbvY4QP8S9wuGrXcYqxrX6n4";
const CAREER_SHEET_ID = process.env.CAREER_SHEET_ID || "14z1jqBVBgVYFyCFYHU6hMoJvwfJZRalP8WQfJtiMKzQ";

// スプレッドシートの読み込みは数秒かかるので、5分間は同じ結果を使い回す
const CACHE_MS = 5 * 60 * 1000;
let cache = null; // { at, model }

async function loadModel(force) {
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

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "GETのみ対応しています" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    res.status(500).json({ error: "サーバー側にSUPABASE_SERVICE_ROLE_KEYが設定されていません" });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const callerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!callerToken) {
    res.status(401).json({ error: "ログインしてから開いてください" });
    return;
  }
  let staff;
  try {
    staff = await getCallerStaff(callerToken, serviceKey);
  } catch (e) {
    res.status(401).json({ error: "ログイン情報を確認できませんでした。ログインし直してください" });
    return;
  }
  if (!staff) {
    res.status(403).json({ error: "スタッフ情報が見つかりませんでした" });
    return;
  }

  let model;
  try {
    // 「最新に更新」ボタンは管理者だけ（シートの読み込み回数を抑えるため）
    model = await loadModel(req.query && req.query.refresh === "1" && staff.role === "admin");
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
    return;
  }

  const viewer = resolveViewer(model, staff);
  if (!viewer) {
    res.status(403).json({ error: `スプレッドシートに「${staff.name || ""}」さんが見つかりませんでした。管理者に、スタッフ名がシートの氏名と一致しているか確認してもらってください` });
    return;
  }
  res.status(200).json({ ...filterModelForViewer(model, viewer), isAdmin: staff.role === "admin" });
}
