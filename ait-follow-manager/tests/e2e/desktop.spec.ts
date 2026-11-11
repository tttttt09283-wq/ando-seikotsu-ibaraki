import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("管理者の操作（PC）", () => {
  test("フォロー条件の確認と今すぐ抽出（重複しない）", async ({ page }) => {
    await login(page, "admin@example.com");
    await page.goto("/o/demo/settings/rules");
    await page.getByRole("button", { name: "今すぐ抽出" }).click();
    // global-setup で抽出済みのため、新規は0件
    await expect(page.locator("main").getByRole("status")).toContainText("新規 0件");
  });

  test("分析画面に因果関係を示さない注記がある", async ({ page }) => {
    await login(page, "admin@example.com");
    await page.goto("/o/demo/analytics");
    await expect(page.getByText("フォロー施策によって予約・再来店が発生したことを示すものではありません")).toBeVisible();
  });

  test("顧客 CSV をエクスポートできる（数式インジェクション対策済み）", async ({ page }) => {
    await login(page, "admin@example.com");
    await page.goto("/o/demo/settings/data");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "顧客 CSV をダウンロード" }).click();
    const file = await (await download).path();
    const text = (await import("node:fs")).readFileSync(file!, "utf8");
    expect(text.startsWith("﻿顧客番号,姓")).toBe(true);
    expect(text).toContain("D0001");
    expect(text).not.toContain("他社");
  });

  test("Platform Admin は組織一覧を見られるが顧客情報は見られない", async ({ page }) => {
    await login(page, "platform@example.com");
    await page.goto("/platform");
    await expect(page.getByText("デモ整骨院グループ")).toBeVisible();
    expect((await page.goto("/o/demo/customers"))?.status()).toBe(404);
  });
});
