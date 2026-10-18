import { expect, test } from "@playwright/test";

/**
 * 実際の Supabase を使うログイン系テスト。以下を設定した場合のみ実行する。
 *   E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY
 *   E2E_HQ_EMAIL / E2E_HQ_PASSWORD            … 本部事務アカウント
 *   E2E_MANAGER_EMAIL / E2E_MANAGER_PASSWORD  … 院長アカウント
 */
const hq = { email: process.env.E2E_HQ_EMAIL, password: process.env.E2E_HQ_PASSWORD };
const manager = { email: process.env.E2E_MANAGER_EMAIL, password: process.env.E2E_MANAGER_PASSWORD };

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
}

test.describe("ログインとロール別メニュー", () => {
  test.skip(!process.env.E2E_SUPABASE_URL, "E2E_SUPABASE_URL が未設定のためスキップ");

  test("誤ったパスワードではログインできない", async ({ page }) => {
    await login(page, hq.email ?? "nobody@example.com", "wrong-password-123");
    await expect(page.getByRole("status")).toHaveText("メールアドレスまたはパスワードが正しくありません");
  });

  test("本部事務はマスタ管理メニューが表示され、店舗を一覧できる", async ({ page }) => {
    test.skip(!hq.email || !hq.password, "本部アカウント未設定");
    await login(page, hq.email!, hq.password!);
    await expect(page).toHaveURL(/\/hq$/);
    await page.getByRole("link", { name: "店舗マスタ" }).click();
    await expect(page.getByRole("cell", { name: "茨木院" })).toBeVisible();
  });

  test("院長はマスタ画面を開けない", async ({ page }) => {
    test.skip(!manager.email || !manager.password, "院長アカウント未設定");
    await login(page, manager.email!, manager.password!);
    await expect(page).toHaveURL(/\/manager$/);
    await expect(page.getByRole("link", { name: "店舗マスタ" })).toHaveCount(0);
    await page.goto("/admin/clinics");
    await expect(page).toHaveURL(/\/forbidden$/);
  });
});
