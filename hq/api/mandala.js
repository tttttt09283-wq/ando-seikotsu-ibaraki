// 本部システム: /api/mandala
// 会社・院のマンダラチャート（台帳の「マンダラ」「マンダラ実行」シート）。読み込み・マスの編集・月のチェック。
// 中身は予約管理側の /api/mandala と同じ処理（lib/mandala-api.js）を、本部の管理者だけに使わせる。
import { mandalaHandler } from "../../lib/mandala-api.js";
import { authenticate } from "../../lib/incentive-data.js";
import { requireHq } from "./_hq-auth.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  // 管理者かどうかを先に確かめる（ログインの確認は mandalaHandler の中でもう一度行う）
  const staff = await authenticate(req, res);
  if (!staff || !requireHq(staff, res)) return;
  if (req.method === "POST" && req.body && req.body.action === "linkKdi") {
    res.status(400).json({ error: "個人KDIの紐づけは評価・インセンティブの画面で行ってください" });
    return;
  }
  return mandalaHandler(req, res);
}
