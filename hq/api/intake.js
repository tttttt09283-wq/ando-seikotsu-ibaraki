// 本部システム（Enejoy Hand 本部）: /api/intake
// 院の日計表（月ごとのスプレッドシート）を読む。部門への振り分け・集計は画面側（hq-logic.js の parseDailyBook / intakeDeptTable）。
//
//   GET /api/intake           … 日計表フォルダの中のスプレッドシート一覧
//   GET /api/intake?file=ID   … そのスプレッドシートの全タブ（2次元配列）
//   GET /api/intake?kpi=1     … 店舗別KPIダッシュボード（全社・院ごとのタブ、「11期」「10期」の月別の項目）
//   GET /api/intake?wage=1    … 賃金管理表の勤怠（出勤日数・休日・有休・勤務時間・残業の時間数）だけ。
//                                金額の列（欠勤控除・基礎賃金・時給・残業代）は読まない。salary_viewer の管理者だけ
//
// Vercel の環境変数（任意）:
//   DAILY_FOLDER_ID … 日計表を入れているGoogleドライブのフォルダ（未設定なら下の既定）
// フォルダ（またはファイル）を GOOGLE_SERVICE_ACCOUNT_EMAIL のサービスアカウントに「閲覧者」で共有してください。

import { batchGet, getSheetTitles, listFolderSpreadsheets } from "../../lib/google-sheets.js";
import { authenticate, CAREER_SHEET_ID } from "../../lib/incentive-data.js";
import { requireHq } from "./_hq-auth.js";

const DAILY_FOLDER_ID = process.env.DAILY_FOLDER_ID || "1QMZIVjuQNNA6UMC9D_YFx1S8LmQO0ReB";
const WAGE_SHEET_ID = process.env.WAGE_SHEET_ID || "1QHrZ68ulP8h9Y2nAZWaq8Q1VgMybjnbFK_eBh9n2wDo";
const KPI_SHEET_ID = process.env.KPI_SHEET_ID || "1WT9BF6rrpRPZvRjAvYqSg4_fKs3S6lv_e4AL6sZ98w8";
const SUPABASE_URL = "https://dctlirxcwitcupaewiyt.supabase.co";
// 賃金管理表は A〜P 列だけ（日数・時間）。H列（欠勤控除）は金額なので捨てる。Q列から右（計算用・残業代・基礎賃金・時給）は読まない
const WAGE_RANGE = "A1:P150";
const WAGE_DROP_COLS = [7];

async function isSalaryViewer(staff) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !staff || !staff.id) return false;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/clinic_staff?id=eq.${encodeURIComponent(staff.id)}&select=salary_viewer`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) return false;
  const rows = await r.json();
  return !!(rows && rows[0] && rows[0].salary_viewer === true);
}
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
    if (q.kpi) {
      const data = await cached("kpi", refresh, async () => {
        let titles;
        try { titles = await getSheetTitles(KPI_SHEET_ID); } catch (e) {
          throw new Error(`店舗別KPIダッシュボードを読み込めませんでした。サービスアカウントに「閲覧者」で共有されているか確認してください（${e.message}）`);
        }
        titles = titles.filter((t) => !/原本|分析/.test(t));
        const values = titles.length ? await batchGet(KPI_SHEET_ID, titles.map((t) => `${quote(t)}!A1:Z80`)) : [];
        return { url: `https://docs.google.com/spreadsheets/d/${KPI_SHEET_ID}/edit`, tabs: titles.map((title, i) => ({ title, values: values[i] || [] })), loadedAt: new Date().toISOString() };
      });
      res.status(200).json(data);
      return;
    }
    if (q.wage) {
      if (!(await isSalaryViewer(staff))) { res.status(403).json({ error: "勤怠（賃金管理表）を見る権限がありません（salary_viewer が必要です）" }); return; }
      const data = await cached("wage", refresh, async () => {
        let titles;
        try { titles = await getSheetTitles(WAGE_SHEET_ID); } catch (e) {
          throw new Error(`賃金管理表を読み込めませんでした。サービスアカウントに「閲覧者」で共有されているか確認してください（${e.message}）`);
        }
        titles = titles.filter((t) => !/原本/.test(t));
        const values = titles.length ? await batchGet(WAGE_SHEET_ID, titles.map((t) => `${quote(t)}!${WAGE_RANGE}`)) : [];
        const strip = (rows) => (rows || []).map((row) => row.filter((_, i) => !WAGE_DROP_COLS.includes(i)));
        return { url: `https://docs.google.com/spreadsheets/d/${WAGE_SHEET_ID}/edit`, tabs: titles.map((title, i) => ({ title, values: strip(values[i]) })), loadedAt: new Date().toISOString() };
      });
      res.status(200).json(data);
      return;
    }
    if (q.file) {
      const id = String(q.file);
      if (!/^[A-Za-z0-9_-]{20,100}$/.test(id)) { res.status(400).json({ error: "スプレッドシートのIDが正しくありません" }); return; }
      // 給与の入ったシートは日計表として丸ごと読ませない（勤怠は ?wage=1 で金額を除いて返す）
      if (id === WAGE_SHEET_ID || id === CAREER_SHEET_ID) { res.status(403).json({ error: "このスプレッドシートは日計表として読み込めません" }); return; }
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
