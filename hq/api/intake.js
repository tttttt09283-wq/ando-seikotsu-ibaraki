// 本部システム（Enejoy Hand 本部）: /api/intake
// 院の日計表（月ごとのスプレッドシート）を読む。部門への振り分け・集計は画面側（hq-logic.js の parseDailyBook / intakeDeptTable）。
//
//   GET /api/intake           … 日計表フォルダの中のスプレッドシート一覧
//   GET /api/intake?file=ID   … そのスプレッドシートの全タブ（2次元配列）
//   GET /api/intake?shift=1   … シフト管理表（院ごとのタブ：日付×午前/午後の出勤）
//   GET /api/intake?kpi=1     … 店舗別KPIダッシュボード（全社・院ごとのタブ、「11期」「10期」の月別の項目）
//   GET /api/intake?wage=1    … 賃金管理表の勤怠（出勤日数・休日・有休・勤務時間・残業の時間数）だけ。
//                                金額の列（欠勤控除・基礎賃金・時給・残業代）は読まない。salary_viewer の管理者だけ
//
// Vercel の環境変数（任意）:
//   DAILY_FOLDER_ID … 日計表を入れているGoogleドライブのフォルダ（未設定なら下の既定）
// フォルダ（またはファイル）を GOOGLE_SERVICE_ACCOUNT_EMAIL のサービスアカウントに「閲覧者」で共有してください。

import { batchGet, getSheetTitles, listFolderSpreadsheets, getFileMeta, downloadFile } from "../../lib/google-sheets.js";
import { readXlsx } from "../../lib/xlsx-lite.js";
import { authenticate, CAREER_SHEET_ID } from "../../lib/incentive-data.js";
import { requireHq } from "./_hq-auth.js";

const DAILY_FOLDER_ID = process.env.DAILY_FOLDER_ID || "1QMZIVjuQNNA6UMC9D_YFx1S8LmQO0ReB";
// 賃金管理表：Googleスプレッドシートでも、ドライブに置いた Excel（.xlsx）でもよい（種類は自動で見分ける）
const WAGE_SHEET_ID = process.env.WAGE_SHEET_ID || "1fe0GypQIWsfvA1AzBnCS0Q77Q7NNozxC";
// 給与の入ったファイル（日計表の ?file= では読ませない）
const SALARY_FILE_IDS = [WAGE_SHEET_ID, "1fe0GypQIWsfvA1AzBnCS0Q77Q7NNozxC", "1QHrZ68ulP8h9Y2nAZWaq8Q1VgMybjnbFK_eBh9n2wDo"];
// シフト管理表：月ごとのファイル（「シフト管理表（R8/12)」など）を入れたフォルダ。月はファイル名から判断（「原本」は読まない）
const SHIFT_FOLDER_ID = process.env.SHIFT_FOLDER_ID || "1CCFgGZl5wvVUEpgdKOxhto91WIPVWZiq";
// フォルダが読めないときに使う1つのシフト表
const SHIFT_SHEET_ID = process.env.SHIFT_SHEET_ID || "1mwAeFrqHpzWdEB-qfXIf10_MWvyrDptGOPmPZYWvet8";
const fileMonth = (name) => {
  const s = String(name || "").replace(/[０-９]/g, (c) => String("０１２３４５６７８９".indexOf(c)));
  let m = s.match(/R(\d{1,2})[.\-/年](\d{1,2})(?!\d)/);
  if (m) return `${2018 + Number(m[1])}-${String(Number(m[2])).padStart(2, "0")}`;
  m = s.match(/(20\d{2})[.\-/年](\d{1,2})(?!\d)/);
  return m ? `${m[1]}-${String(Number(m[2])).padStart(2, "0")}` : null;
};
const KPI_SHEET_ID = process.env.KPI_SHEET_ID || "1WT9BF6rrpRPZvRjAvYqSg4_fKs3S6lv_e4AL6sZ98w8";
const SUPABASE_URL = "https://dctlirxcwitcupaewiyt.supabase.co";
// 賃金管理表は A〜P 列だけ（日数・時間）。H列（欠勤控除）は金額なので捨てる。Q列から右（計算用・残業代・基礎賃金・時給）は読まない
const WAGE_RANGE = "A1:P150";
const WAGE_DROP_COLS = [7];
const WAGE_MAX_COL = 16; // A〜P

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
    if (q.shift) {
      // months=2026-11,2026-12（その月のファイルだけ読む。最大4か月）
      const months = String(q.months || "").split(",").map((x) => x.trim()).filter((x) => /^\d{4}-\d{2}$/.test(x)).slice(0, 4);
      const readBook = async (id) => {
        const titles = (await getSheetTitles(id)).filter((t) => !/原本|サマリー|スケジュール/.test(t));
        const values = titles.length ? await batchGet(id, titles.map((t) => `${quote(t)}!A1:Z90`)) : [];
        return titles.map((title, i) => ({ title, values: values[i] || [] }));
      };
      const data = await cached(`shift:${months.join(",")}`, refresh, async () => {
        let files = [], folderErr = null;
        try { files = (await listFolderSpreadsheets(SHIFT_FOLDER_ID)).map((f) => ({ id: f.id, name: f.name, month: fileMonth(f.name) })).filter((f) => f.month); } catch (e) { folderErr = e.message; }
        const books = [];
        for (const f of files.filter((x) => !months.length || months.includes(x.month))) {
          books.push({ month: f.month, id: f.id, name: f.name, url: `https://docs.google.com/spreadsheets/d/${f.id}/edit`, tabs: await readBook(f.id) });
        }
        if (!files.length) {
          // フォルダが読めない・ファイルがない → 1つのシフト表
          try { books.push({ month: null, id: SHIFT_SHEET_ID, name: "シフト管理表", url: `https://docs.google.com/spreadsheets/d/${SHIFT_SHEET_ID}/edit`, tabs: await readBook(SHIFT_SHEET_ID) }); } catch (e) {
            throw new Error(`シフト管理表を読み込めませんでした。${folderErr ? `フォルダ：${folderErr}。` : ""}サービスアカウントに「閲覧者」で共有されているか確認してください（${e.message}）`);
          }
        }
        return { folderUrl: `https://drive.google.com/drive/folders/${SHIFT_FOLDER_ID}`, folderErr, files, books, loadedAt: new Date().toISOString() };
      });
      res.status(200).json(data);
      return;
    }
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
        let meta;
        try { meta = await getFileMeta(WAGE_SHEET_ID); } catch (e) {
          throw new Error(`賃金管理表を読み込めませんでした。サービスアカウントに「閲覧者」で共有されているか確認してください（${e.message}）`);
        }
        const strip = (rows) => (rows || []).map((row) => (row || []).slice(0, WAGE_MAX_COL).filter((_, i) => !WAGE_DROP_COLS.includes(i)));
        let tabs;
        if (meta.mimeType === "application/vnd.google-apps.spreadsheet") {
          const titles = (await getSheetTitles(WAGE_SHEET_ID)).filter((t) => !/原本/.test(t));
          const values = titles.length ? await batchGet(WAGE_SHEET_ID, titles.map((t) => `${quote(t)}!${WAGE_RANGE}`)) : [];
          tabs = titles.map((title, i) => ({ title, values: strip(values[i]) }));
        } else {
          // Excel：A〜P 列・150行までだけ取り出す（Q列から右の金額はここで捨てる）
          const book = readXlsx(await downloadFile(WAGE_SHEET_ID));
          tabs = book.sheetNames.filter((t) => !/原本/.test(t)).map((title) => ({ title, values: strip(book.sheet(title, { maxRow: 150, maxCol: WAGE_MAX_COL })) }));
        }
        const url = meta.mimeType === "application/vnd.google-apps.spreadsheet" ? `https://docs.google.com/spreadsheets/d/${WAGE_SHEET_ID}/edit` : `https://drive.google.com/file/d/${WAGE_SHEET_ID}/view`;
        return { url, name: meta.name, modifiedTime: meta.modifiedTime, tabs, loadedAt: new Date().toISOString() };
      });
      res.status(200).json(data);
      return;
    }
    if (q.file) {
      const id = String(q.file);
      if (!/^[A-Za-z0-9_-]{20,100}$/.test(id)) { res.status(400).json({ error: "スプレッドシートのIDが正しくありません" }); return; }
      // 給与の入ったシートは日計表として丸ごと読ませない（勤怠は ?wage=1 で金額を除いて返す）
      if (SALARY_FILE_IDS.includes(id) || id === CAREER_SHEET_ID) { res.status(403).json({ error: "このスプレッドシートは日計表として読み込めません" }); return; }
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
