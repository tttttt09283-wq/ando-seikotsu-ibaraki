// /api/nail-sheets（vercel.json で /api/evaluation?__nailsheets=1 に振り替え。関数の数を12以内に保つため）
// 巻き爪 物販プラン（/nail-goods）：各センターの巻き爪分析表（Googleスプレッドシート）をそのまま読んで返す。
// 数字の読み取り（どの列が何か・途中の月の扱いなど）は画面側の nail-goods-logic.js の parseNailSheets で行う。
//
//   GET ?ids=スプレッドシートID,スプレッドシートID,...
//     → { shareWith, results: [{ id, sheets: [{ title, values }] } | { id, error }] }
//   「分析表」を含むシート（「分析表原本」は除く）の A1:AD16 を、表示形式ではなく数字のまま読む。
//   スプレッドシートは、サーバーのサービスアカウント（shareWith）に「閲覧者」で共有されている必要がある。

import { batchGet, getSheetTitles } from "./google-sheets.js";
import { authenticate } from "./incentive-data.js";

export const SHEET_ID_RE = /^[A-Za-z0-9_-]{20,100}$/;
export const MAX_SHEETS = 20;

// 読み込む分析表のシート名（「分析表」「分析表(2025)」「分析表（2026）」など。「分析表原本」は空の雛形なので読まない）
export function pickAnalysisSheets(titles) {
  return (titles || []).filter((t) => String(t).includes("分析表") && !String(t).includes("原本"));
}
export function parseIds(q) {
  return [...new Set(String(q || "").split(",").map((s) => s.trim()).filter((s) => SHEET_ID_RE.test(s)))].slice(0, MAX_SHEETS);
}
const quote = (t) => `'${String(t).replace(/'/g, "''")}'`;

async function readOne(id) {
  try {
    const titles = pickAnalysisSheets(await getSheetTitles(id));
    if (!titles.length) return { id, error: "「分析表」という名前のシートが見つかりませんでした" };
    const values = await batchGet(id, titles.map((t) => `${quote(t)}!A1:AD16`));
    return { id, sheets: titles.map((title, i) => ({ title, values: values[i] || [] })) };
  } catch (e) {
    return { id, error: e.message || "スプレッドシートを読み込めませんでした" };
  }
}

export async function nailSheetsHandler(req, res) {
  if (req.method !== "GET") { res.status(405).json({ error: "GETのみ対応しています" }); return; }
  const staff = await authenticate(req, res);
  if (!staff) return;
  const ids = parseIds(req.query && req.query.ids);
  if (!ids.length) { res.status(400).json({ error: "スプレッドシートのIDがありません" }); return; }
  const results = await Promise.all(ids.map(readOne));
  // 共有先のアドレス（サービスアカウントのメールアドレス。秘密ではなく、スプレッドシートを共有する相手）
  res.status(200).json({ shareWith: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "", results });
}
