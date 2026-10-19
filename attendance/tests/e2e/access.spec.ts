import { expect, test } from "@playwright/test";

test.describe("未ログイン時のアクセス制御", () => {
  for (const path of ["/", "/hq", "/manager", "/admin/clinics", "/admin/staff", "/admin/users", "/admin/holidays", "/me", "/manager/shifts", "/manager/shifts/calendar", "/manager/attendance", "/admin/kiosks", "/manager/leave", "/manager/holiday-credits", "/hq/leave", "/admin/leave-policies", "/hq/approvals", "/hq/leave/import", "/hq/closings", "/exports"]) {
    test(`${path} はログイン画面へ転送される`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByRole("heading", { name: "勤怠管理システム ログイン" })).toBeVisible();
    });
  }
});

test("未ログインでは帳票をダウンロードできない", async ({ request }) => {
  const res = await request.get("/exports/download?report=monthly_all&format=csv_utf8&month=2026-09", { maxRedirects: 0 });
  expect([302, 303, 307, 401]).toContain(res.status());
  expect(res.headers()["content-disposition"]).toBeUndefined();
});
