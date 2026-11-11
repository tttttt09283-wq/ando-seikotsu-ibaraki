import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("スマホ画面での主要操作", () => {
  test("ログイン → タスクを開き → 文面をコピー → 対応済みにする", async ({ page }) => {
    await login(page, "staff@example.com");
    await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();

    await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "タスク" }).click();
    await page.getByRole("tab", { name: /未対応/ }).click();
    await page.locator("main ul li a").first().click();
    await expect(page.getByRole("heading", { name: "メッセージ文面" })).toBeVisible();

    await page.getByRole("button", { name: "文面をコピー" }).click();
    await expect(page.getByRole("button", { name: "コピーしました" })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("様");
    expect(copied).not.toContain("{{");

    await page.getByText("LINE（手動送信）").click();
    await page.getByText("送信した", { exact: true }).click();
    await page.getByRole("button", { name: "対応済みにする" }).click();
    await expect(page.locator("main").getByRole("status")).toContainText("対応済みにしました");
    await expect(page.getByText("LINE（手動送信）").last()).toBeVisible();
  });

  test("連絡手段を選ばずに連絡タスクを対応済みにはできない", async ({ page }) => {
    await login(page, "staff@example.com");
    await page.goto("/o/demo/tasks?tab=open&kind=contact");
    await page.locator("main ul li a").first().click();
    await page.getByRole("button", { name: "対応済みにする" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("連絡手段を選択してください");
  });

  test("顧客を検索し、登録・編集できる", async ({ page }) => {
    await login(page, "staff@example.com");
    await page.goto("/o/demo/customers");
    await page.getByLabel("顧客を検索").fill("あおぞら");
    await page.getByRole("button", { name: "検索" }).click();
    await expect(page.locator("main ul li")).toHaveCount(1);
    await expect(page.locator("main ul li").first()).toContainText("青空 一郎");

    await page.goto("/o/demo/customers/new");
    await page.getByLabel("姓（必須）").fill("E2E");
    await page.getByLabel("名", { exact: true }).fill("試験");
    await page.getByLabel("電話番号").fill("090-0000-5555");
    await page.getByLabel("連絡同意").selectOption("granted");
    await page.getByRole("button", { name: "登録する" }).click();
    await expect(page.getByRole("heading", { name: "E2E 試験" })).toBeVisible();
    await expect(page.getByText("連絡可")).toBeVisible();

    await page.getByRole("link", { name: "編集" }).click();
    await page.getByLabel("名", { exact: true }).fill("編集済");
    await page.getByRole("button", { name: "保存する" }).click();
    await expect(page.getByRole("heading", { name: "E2E 編集済" })).toBeVisible();

    await page.goto("/o/demo/customers");
    await page.getByLabel("顧客を検索").fill("09000005555");
    await page.getByRole("button", { name: "検索" }).click();
    await expect(page.locator("main ul li").first()).toContainText("E2E 編集済");
  });

  test("不正な入力では顧客を登録できない", async ({ page }) => {
    await login(page, "staff@example.com");
    await page.goto("/o/demo/customers/new");
    await page.getByLabel("姓（必須）").fill("=HYPERLINK(1)");
    await page.getByRole("button", { name: "登録する" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("先頭に = + - @ は使用できません");
  });

  test("配信停止を記録すると、警告が表示され連絡タスクが対象外になる", async ({ page }) => {
    await login(page, "staff@example.com");
    await page.goto("/o/demo/customers?follow=open&contact=allowed");
    await page.locator("main ul li a").first().click();
    await page.waitForURL(/customers\/[0-9a-f-]{36}$/);
    const url = page.url();
    await page.goto(`${url}?tab=consent`);
    await page.locator("main fieldset").getByText("配信停止", { exact: true }).click();
    await page.getByRole("button", { name: "記録する" }).click();
    await expect(page.locator("main").getByRole("status")).toContainText("未対応の連絡タスクは対象外になりました");
    await page.goto(`${url}?tab=followups`);
    await expect(page.getByText("配信停止・連絡不可").first()).toBeVisible();
    await expect(page.locator("main").getByRole("alert")).toContainText("配信停止の顧客です");
  });

  test("テンプレートを複製・編集できる（店舗責任者）", async ({ page }) => {
    await login(page, "manager@example.com");
    await page.goto("/o/demo/templates");
    await page.getByRole("link", { name: "季節のご挨拶" }).click();
    await page.getByRole("button", { name: "複製して編集" }).click();
    await expect(page.getByText("テンプレートを複製しました")).toBeVisible();
    await expect(page.getByRole("heading", { name: "季節のご挨拶（コピー）" })).toBeVisible();
    await page.getByLabel("本文").fill("{{顧客名}}様\n寒くなりましたね。{{店舗名}}より");
    await page.getByRole("button", { name: "保存する" }).click();
    await expect(page.locator("main").getByRole("status")).toContainText("第2版");
    await expect(page.locator("pre")).toContainText("見本 花子様");

    await page.getByLabel("本文").fill("{{誕生日}}おめでとうございます");
    await page.getByRole("button", { name: "保存する" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("使用できない差し込み変数");
  });

  test("CSV 取込で不正データはエラー一覧を表示し、取り込まない", async ({ page }) => {
    await login(page, "manager@example.com");
    await page.goto("/o/demo/customers/import");
    const csv = "姓,名,電話番号,店舗コード\nテスト,太郎,090-0000-1234,HQ\n,花子,abc,HQ\n他店,一郎,,EKI\n";
    await page.getByLabel(/CSV ファイル/).setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.getByRole("button", { name: "検証して取り込む" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("エラーがあるため取り込んでいません");
    const table = page.getByRole("table");
    await expect(table).toContainText("必須です");
    await expect(table).toContainText("電話番号の形式が正しくありません");
    await expect(table).toContainText("この店舗への取込権限がありません");

    await page.getByLabel(/CSV ファイル/).setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.getByLabel("エラー行を除いて取り込む").check();
    await page.getByRole("button", { name: "検証して取り込む" }).click();
    await expect(page.locator("main").getByRole("status")).toContainText("取り込みが完了しました");
  });

  test("権限外の画面・他組織の画面は表示されない", async ({ page }) => {
    await login(page, "staff@example.com");
    for (const path of ["/o/demo/settings/rules", "/o/demo/settings/staff", "/o/demo/settings/audit", "/o/demo/analytics", "/o/sample-salon/dashboard", "/platform"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
    }
    await page.goto("/o/demo/more");
    await expect(page.getByRole("link", { name: "監査ログ" })).toHaveCount(0);
  });

  test("未ログインではログイン画面に戻される", async ({ page }) => {
    await page.goto("/o/demo/customers");
    await expect(page).toHaveURL(/\/login$/);
  });
});
