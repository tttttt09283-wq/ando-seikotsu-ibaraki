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
//   SALES_SHEET_ID / CAREER_SHEET_ID（任意。未設定なら lib/incentive-data.js の既定のシートを読む）

import { batchGet, batchUpdate } from "../lib/google-sheets.js";
import { resolveViewer, filterModelForViewer, parseMonth } from "../lib/incentive-calc.js";
import { CAREER_SHEET_ID, loadModel, invalidateModel, authenticate, viewerNotFound } from "../lib/incentive-data.js";

const PAYROLL_SHEET = "月次推移ダッシュボード";

// 管理者が入力した月の支給合計額（社保抜き）を台帳の「月次推移ダッシュボード」に書き込む。
// 会社売上（B列）も「院」シートの実績合計で更新し、人件費率の数式がそのまま使えるようにする。
async function savePayroll(body) {
  const month = Number(body && body.month);
  const amount = Number(body && body.amount);
  if (!(month >= 1 && month <= 12)) throw new Error("月が正しくありません");
  if (!Number.isFinite(amount) || amount < 0) throw new Error("支給合計額を数字で入力してください");
  const [labels] = await batchGet(CAREER_SHEET_ID, [`'${PAYROLL_SHEET}'!A1:A14`]);
  const idx = labels.findIndex((r) => parseMonth(r && r[0]) === month);
  if (idx < 0) throw new Error(`「${PAYROLL_SHEET}」シートに${month}月の行が見つかりません`);
  const model = await loadModel(true);
  const sales = model.clinics.reduce((a, c) => a + (c.months.find((m) => m.month === month)?.actual || 0), 0);
  const row = idx + 1;
  const data = [{ range: `'${PAYROLL_SHEET}'!C${row}`, values: [[Math.round(amount)]] }];
  if (sales > 0) data.push({ range: `'${PAYROLL_SHEET}'!B${row}`, values: [[Math.round(sales)]] });
  await batchUpdate(CAREER_SHEET_ID, data);
  invalidateModel();
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "GET・POSTのみ対応しています" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");

  const staff = await authenticate(req, res);
  if (!staff) return;

  if (req.method === "POST") {
    if (staff.role !== "admin") {
      res.status(403).json({ error: "人件費の入力は管理者のみ可能です" });
      return;
    }
    try {
      await savePayroll(req.body);
    } catch (e) {
      res.status(400).json({ error: e.message || String(e) });
      return;
    }
  }

  let model;
  try {
    model = await loadModel(req.query && req.query.refresh === "1");
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
    return;
  }

  const viewer = resolveViewer(model, staff);
  if (!viewer) return viewerNotFound(res, staff);
  res.status(200).json({
    ...filterModelForViewer(model, viewer),
    isAdmin: staff.role === "admin",
    // 院ID・PASSの管理は社長・GM（メールアドレスでログインしたとき）だけ
    canManageLogins: !staff.viaPin && (staff.role === "admin" || viewer.grade === "G6"),
  });
}
