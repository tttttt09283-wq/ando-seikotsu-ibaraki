// 本部システム（Enejoy Hand 本部）: /api/ledger
// 台帳（進捗売上実績・キャリア制度・人件費42%管理台帳）から、全院の予算・実績・人件費・スタッフ・等級・BMエリアを返す。
// 本部システムは管理者（社長・本部）だけが使う。予約管理システムとは別の Vercel プロジェクトとして動く。
//
// Vercel の環境変数（予約管理と同じ値）:
//   SUPABASE_SERVICE_ROLE_KEY / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY
//   （任意）SALES_SHEET_ID / CAREER_SHEET_ID

import { resolveViewer, filterModelForViewer } from "../../lib/incentive-calc.js";
import { loadModel, authenticate, viewerNotFound } from "../../lib/incentive-data.js";
import { requireHq } from "./_hq-auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") { res.status(405).json({ error: "GETのみ対応しています" }); return; }
  res.setHeader("Cache-Control", "no-store");
  const staff = await authenticate(req, res);
  if (!staff || !requireHq(staff, res)) return;
  let model;
  try {
    model = await loadModel(req.query && req.query.refresh === "1");
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
    return;
  }
  const viewer = resolveViewer(model, staff);
  if (!viewer) return viewerNotFound(res, staff);
  res.status(200).json({ ...filterModelForViewer(model, viewer), isAdmin: true });
}
