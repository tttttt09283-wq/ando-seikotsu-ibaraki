import { expect, type Page } from "@playwright/test";

export const PASSWORD = "DemoPass1234";

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(PASSWORD);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/o\/demo\/dashboard|\/select-org/);
}
