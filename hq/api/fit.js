// 本部システム（Enejoy Hand 本部）: /api/fit
// 「人員の適正判断」用に、組織図（月ごとのタブ）と年間予算（院別・月別の予算・実績）の2つのスプレッドシートを
// そのまま（2次元配列で）返す。読み取り・判定は画面側（hq-logic.js の parseOrgSheet / parseBudgetSheet / fitMonth）。
//
// Vercel の環境変数（任意。未設定なら下の既定のシート）:
//   ORG_SHEET_ID    … 【ENEJOYHAND】組織図
//   BUDGET_SHEET_ID … 年間予算とR7/8比較
// どちらのシートも、GOOGLE_SERVICE_ACCOUNT_EMAIL のサービスアカウントに「閲覧者」で共有してください。

import { batchGet, getSheetTitles } from "../../lib/google-sheets.js";
import { authenticate } from "../../lib/incentive-data.js";
import { requireHq } from "./_hq-auth.js";

const ORG_SHEET_ID = process.env.ORG_SHEET_ID || "1MjFLU6pZc_fVrVwmTuEoK1lvcqGgIEv5Uzc0kuDi3V8";
const BUDGET_SHEET_ID = process.env.BUDGET_SHEET_ID || "1C5fRW2bwjaA48rUS7UTeCwr_-Oe6vlAJZm3SDqJ_8Tc";
const CACHE_MS = 5 * 60 * 1000;
let cache = null; // { at, data }

const quote = (t) => `'${String(t).replace(/'/g, "''")}'`;

async function readBook(id, range, label) {
  let titles;
  try {
    titles = await getSheetTitles(id);
  } catch (e) {
    throw new Error(`${label}を読み込めませんでした。サービスアカウントに「閲覧者」で共有されているか確認してください（${e.message}）`);
  }
  const values = titles.length ? await batchGet(id, titles.map((t) => `${quote(t)}!${range}`)) : [];
  return { id, url: `https://docs.google.com/spreadsheets/d/${id}/edit`, tabs: titles.map((title, i) => ({ title, values: values[i] || [] })) };
}

export default async function handler(req, res) {
  if (req.method !== "GET") { res.status(405).json({ error: "GETのみ対応しています" }); return; }
  res.setHeader("Cache-Control", "no-store");
  const staff = await authenticate(req, res);
  if (!staff || !requireHq(staff, res)) return;
  try {
    const refresh = req.query && req.query.refresh === "1";
    if (!cache || refresh || Date.now() - cache.at > CACHE_MS) {
      const [org, budget] = await Promise.all([
        readBook(ORG_SHEET_ID, "A1:Z80", "組織図のスプレッドシート"),
        readBook(BUDGET_SHEET_ID, "A1:Z150", "年間予算のスプレッドシート"),
      ]);
      cache = { at: Date.now(), data: { org, budget, loadedAt: new Date().toISOString() } };
    }
    res.status(200).json(cache.data);
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}
