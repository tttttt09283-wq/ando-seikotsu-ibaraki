import { expect, test } from "@playwright/test";

test.describe("未ログイン時のアクセス制御", () => {
  for (const path of ["/", "/hq", "/manager", "/admin/clinics", "/admin/staff", "/admin/users", "/admin/holidays", "/me", "/manager/shifts", "/manager/shifts/calendar"]) {
    test(`${path} はログイン画面へ転送される`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByRole("heading", { name: "勤怠管理システム ログイン" })).toBeVisible();
    });
  }

});

test.describe("共用端末（キオスク）", () => {
  test("ログインなしで表示され、管理画面へのリンクを持たない", async ({ page }) => {
    await page.goto("/kiosk");
    await expect(page).toHaveURL(/\/kiosk$/);
    await expect(page.getByRole("heading", { name: "打刻端末" })).toBeVisible();
    await expect(page.locator("a")).toHaveCount(0);
  });
});
