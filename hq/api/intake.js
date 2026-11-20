// 本部システム（Enejoy Hand 本部）: /api/intake
// 院の日計表（月ごとのスプレッドシート）を読む。部門への振り分け・集計は画面側（hq-logic.js の parseDailyBook / intakeDeptTable）。
//
//   GET /api/intake           … 日計表フォルダの中のスプレッドシート一覧
//   GET /api/intake?file=ID   … そのスプレッドシートの全タブ（2次元配列）
//
// Vercel の環境変数（任意）:
//   DAILY_FOLDER_ID … 日計表を入れているGoogleドライブのフォルダ（未設定なら下の既定）
// フォルダ（またはファイル）を GOOGLE_SERVICE_ACCOUNT_EMAIL のサービスアカウントに「閲覧者」で共有してください。

import { batchGet, getSheetTitles, listFolderSpreadsheets } from "../../lib/google-sheets.js";
import { authenticate } from "../../lib/incentive-data.js";
import { requireHq } from "./_hq-auth.js";

const DAILY_FOLDER_ID = process.env.DAILY_FOLDER_ID || "1QMZIVjuQNNA6UMC9D_YFx1S8LmQO0ReB";
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map(); // key → { at, data }
const quote = (t) => `'${String(t).replace(/'/g, "''")}'`;

async function cached(key, refresh, fn) {
  const hit = cache.get(key);
  if (!refresh && hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const data = await fn();
  cache.set(key, { at: Date.now(), data });
  return data;
}

export default async function handler(req, res) {
  if (req.method !== "GET") { res.status(405).json({ error: "GETのみ対応しています" }); return; }
  res.setHeader("Cache-Control", "no-store");
  const staff = await authenticate(req, res);
  if (!staff || !requireHq(staff, res)) return;
  const q = req.query || {};
  const refresh = q.refresh === "1";
  try {
    if (q.file) {
      const id = String(q.file);
      if (!/^[A-Za-z0-9_-]{20,100}$/.test(id)) { res.status(400).json({ error: "スプレッドシートのIDが正しくありません" }); return; }
      const data = await cached(`file:${id}`, refresh, async () => {
        let titles;
        try { titles = await getSheetTitles(id); } catch (e) {
          throw new Error(`日計表を読み込めませんでした。サービスアカウントに「閲覧者」で共有されているか確認してください（${e.message}）`);
        }
        const values = titles.length ? await batchGet(id, titles.map((t) => `${quote(t)}!A1:AZ120`)) : [];
        return { id, url: `https://docs.google.com/spreadsheets/d/${id}/edit`, tabs: titles.map((title, i) => ({ title, values: values[i] || [] })), loadedAt: new Date().toISOString() };
      });
      res.status(200).json(data);
      return;
    }
    const data = await cached("folder", refresh, async () => {
      let files = [], folderErr = null;
      try { files = await listFolderSpreadsheets(DAILY_FOLDER_ID); } catch (e) { folderErr = e.message; }
      return { folderId: DAILY_FOLDER_ID, folderUrl: `https://drive.google.com/drive/folders/${DAILY_FOLDER_ID}`, files, folderErr };
    });
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}
