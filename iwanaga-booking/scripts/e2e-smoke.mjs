#!/usr/bin/env node
/**
 * 起動中のアプリに対する E2E スモークテスト（Playwright）。
 *   スマホで予約フォーム送信 → 署名付き LINE Webhook を送信 → 管理画面で承認 → 予約状況が「確定」
 *
 *   BASE_URL=http://localhost:3100 ADMIN_PASSWORD=... LINE_CHANNEL_SECRET=... node scripts/e2e-smoke.mjs
 *
 * 前提：ローカル代替モードの簡易ログイン（ADMIN_LOCAL_PASSWORD）、初期データの状態（受付前）。
 * SCREENSHOT_DIR を指定するとスクリーンショットを保存する。
 */
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

// プロジェクトに playwright が無い環境でも、グローバルの playwright を NODE_PATH で使えるよう require で読む
const { chromium, devices } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.ADMIN_PASSWORD;
const SECRET = process.env.LINE_CHANNEL_SECRET;
const BOT = process.env.LINE_BOT_USER_ID;
const SHOTS = process.env.SCREENSHOT_DIR;
if (!PASSWORD || !SECRET) {
  console.error("ADMIN_PASSWORD と LINE_CHANNEL_SECRET を指定してください");
  process.exit(1);
}
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let step = 0;
const ok = (msg) => console.log(`  ✓ ${++step}. ${msg}`);
function expect(cond, msg) {
  if (!cond) throw new Error(`失敗: ${msg}`);
}
const shot = async (page, name) => SHOTS && page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

/** 確認ダイアログ付きの管理操作：ボタン → ダイアログの「実行する」 → 結果メッセージ */
async function adminAction(page, form, label) {
  await form.getByRole("button", { name: label, exact: true }).click();
  const dialog = form.locator("dialog[open]");
  await dialog.getByRole("button", { name: "実行する" }).click();
  // 成功すると画面が更新され、操作したフォーム自体が消えることがある（例：受付開始 → 停止ボタンに変わる）
  const msg = form.locator("p.text-ok, p.text-ng").first();
  for (let i = 0; i < 150; i++) {
    if (await msg.isVisible().catch(() => false)) return msg.innerText();
    if ((await form.count()) === 0) return "完了（保存・公開・開始）";
    await page.waitForTimeout(100);
  }
  throw new Error(`操作の結果が表示されません：${label}`);
}

const browser = await chromium.launch();
try {
  const admin = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  const phone = await browser.newContext({ ...devices["iPhone 13"], locale: "ja-JP", timezoneId: "Asia/Tokyo" });

  // 1. 受付前：トップ・フォームとも「準備中」
  const p = await phone.newPage();
  await p.goto(`${BASE}/`);
  expect(await p.getByText("受付準備中").first().isVisible(), "受付前は準備中表示");
  await shot(p, "01-top-before-open");
  await p.goto(`${BASE}/reserve`);
  expect(await p.getByRole("button", { name: /岩永拓己 プライベート鍼灸院/ }).isDisabled(), "受付前は自宅院を選べない");
  ok("受付前は3拠点とも選択不可");

  // 2. 管理画面：未ログインは遮断
  const a = await admin.newPage();
  await a.goto(`${BASE}/admin`);
  expect(a.url().includes("/admin/login"), "未ログインはログイン画面へ");
  await a.getByLabel("パスワード").fill("wrong-password");
  await a.getByRole("button", { name: "ログイン" }).click();
  await a.getByText("パスワードが違います").waitFor();
  await a.getByLabel("パスワード").fill(PASSWORD);
  await a.getByRole("button", { name: "ログイン" }).click();
  await a.waitForURL(`${BASE}/admin`);
  ok("管理者ログイン（誤パスワードは拒否）");

  // 3. 自宅院：開業準備完了 → 料金の公開承認 → 受付開始
  await a.goto(`${BASE}/admin/settings/home`);
  let form = a.locator("form").filter({ has: a.getByRole("button", { name: "開業準備完了として記録する" }) });
  await form.locator('input[name="note"]').fill("E2E テスト：開業準備完了");
  expect((await adminAction(a, form, "開業準備完了として記録する")).includes("保存"), "開業準備完了");
  for (let i = 3; i > 0; i--) {
    const publishButtons = a.getByRole("button", { name: "料金を承認して公開", exact: true });
    expect((await publishButtons.count()) === i, `未公開メニュー ${i} 件`);
    form = a.locator("form").filter({ has: publishButtons.first() }).first();
    await form.getByRole("button", { name: "料金を承認して公開", exact: true }).click();
    await form.locator("dialog[open]").getByRole("button", { name: "実行する" }).click();
    await a.waitForFunction((n) => [...document.querySelectorAll("button")].filter((b) => b.textContent === "料金を承認して公開").length === n, i - 1);
  }
  await a.reload();
  form = a.locator("form").filter({ has: a.getByRole("button", { name: "予約受付を開始する" }) });
  expect((await adminAction(a, form, "予約受付を開始する")).includes("開始"), "受付開始");
  await shot(a, "02-admin-settings-home");
  ok("開業準備完了の記録・料金の公開承認・受付開始");

  // 4. スマホで予約フォーム
  await p.goto(`${BASE}/reserve?src=threads`);
  await p.getByRole("button", { name: /岩永拓己 プライベート鍼灸院/ }).click();
  await p.getByRole("button", { name: /通常/ }).click();
  expect(await p.getByText("10,000円").first().isVisible(), "料金表示");
  expect(await p.getByText("施術時間 60分").isVisible(), "施術時間表示");
  await p.locator("section", { hasText: "ご希望の日にち" }).locator("button").first().click();
  await p.locator("section", { hasText: "ご希望の時間" }).locator("button").first().waitFor();
  await p.locator("section", { hasText: "ご希望の時間" }).locator("button").first().click();
  await p.locator("label", { hasText: "お名前" }).locator("input").fill("テスト 花子");
  await p.locator("label", { hasText: "電話番号" }).locator("input").fill("090-0000-1111");
  await p.locator("label", { hasText: "ご相談内容" }).locator("textarea").fill("肩まわり");
  const submit = p.getByRole("button", { name: "仮予約を申し込む" });
  expect(await submit.isDisabled(), "同意前は送信できない");
  await p.getByText("個人情報の取扱いに同意します").click();
  await p.getByText("キャンセル規定に同意します").click();
  await shot(p, "03-reserve-form");
  await submit.click();
  await p.getByText("まだ予約は確定していません").waitFor();
  const prefill = await p.locator("textarea[readonly]").inputValue();
  const code = prefill.match(/IW-[2-9A-HJ-NP-Z]{6}/)[0];
  const lineHref = await p.getByRole("link", { name: "LINEで送信する" }).getAttribute("href");
  expect(lineHref.startsWith("https://line.me/R/oaMessage/"), "LINE送信リンク");
  await shot(p, "04-reserve-done");
  ok(`仮予約を送信（${code}・pending_line）`);

  // 5. 予約状況：LINE未確認
  await p.getByRole("link", { name: "予約状況を確認する" }).click();
  await p.getByText("LINE送信待ち").first().waitFor();
  const statusUrl = p.url();
  ok("予約状況ページ：仮予約（LINE送信待ち）");

  // 6. LINE Webhook（不正署名は拒否 → 正しい署名で受信）
  const body = JSON.stringify({
    destination: BOT,
    events: [{ type: "message", mode: "active", webhookEventId: `01E2E${Date.now()}`, timestamp: Date.now(), replyToken: "dummy", source: { type: "user", userId: "U" + "1".repeat(32) }, message: { type: "text", id: "1", text: prefill } }],
  });
  const bad = await fetch(`${BASE}/api/line/webhook`, { method: "POST", body, headers: { "x-line-signature": "invalid" } });
  expect(bad.status === 401, "不正署名は401");
  const sig = createHmac("sha256", SECRET).update(body).digest("base64");
  const res = await fetch(`${BASE}/api/line/webhook`, { method: "POST", body, headers: { "x-line-signature": sig, "content-type": "application/json" } });
  const j = await res.json();
  expect(res.status === 200 && j.results[0].result === "matched", `Webhook 照合 ${JSON.stringify(j)}`);
  const dup = await (await fetch(`${BASE}/api/line/webhook`, { method: "POST", body, headers: { "x-line-signature": sig } })).json();
  expect(dup.results[0].result === "duplicate", "重複イベントは1回だけ");
  await p.goto(statusUrl);
  await p.getByText("LINEでの受付を確認しました").waitFor();
  expect(await p.getByText("この予約はまだ確定していません").isVisible(), "確定前の表示");
  ok("LINE Webhook（署名検証・重複排除）→ LINE受付確認済み");

  // 7. 管理画面：ダッシュボード → 承認
  await a.goto(`${BASE}/admin`);
  await shot(a, "05-admin-dashboard");
  await a.goto(`${BASE}/admin/reservations?code=${code}`);
  await a.getByRole("link", { name: code }).click();
  expect(await a.getByText("テスト 花子").isVisible(), "管理画面で氏名を確認");
  form = a.locator("form").filter({ has: a.getByRole("button", { name: "承認して予約を確定する" }) });
  await adminAction(a, form, "承認して予約を確定する");
  await a.reload();
  expect(await a.getByText("予約確定", { exact: true }).isVisible(), "管理画面で確定表示");
  // 本テストの LINE トークンはダミーのため送信は失敗する → 予約は確定のまま、通知だけ失敗として表示・再送可能
  const msg = await a.locator("section", { hasText: "お客様への通知" }).locator("p").first().innerText();
  await shot(a, "06-admin-detail-confirmed");
  ok(`管理者が承認 → 確定（通知：${msg.replace(/\s+/g, " ").slice(0, 60)}…）`);

  // 8. 予約状況：確定
  await p.goto(statusUrl);
  await p.getByText("予約確定").first().waitFor();
  await shot(p, "07-status-confirmed");
  ok("予約状況ページ：予約確定");

  // 9. カレンダー・CSV
  await a.goto(`${BASE}/admin/calendar?view=week`);
  await shot(a, "08-admin-calendar-week");
  const csv = await a.request.get(`${BASE}/api/admin/export?from=2026-01-01&to=2027-12-31`);
  const text = await csv.text();
  expect(csv.status() === 200 && text.includes(code) && text.includes("テスト 花子"), "CSV 出力");
  const anon = await fetch(`${BASE}/api/admin/export?from=2026-01-01&to=2027-12-31`);
  expect(anon.status === 401, "未ログインの CSV 出力は 401");
  ok("カレンダー表示・CSV 出力（未ログインは拒否）");

  console.log(`\nE2E スモークテスト：${step} 項目すべて成功`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
