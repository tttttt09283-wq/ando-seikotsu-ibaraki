import { defineConfig, devices } from "@playwright/test";

/**
 * E2E（ローカル Supabase ＋ 本番ビルド）。事前に `npm run db:start` と `npm run build` が必要。
 * テストはデータを共有するため直列で実行する。
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "off",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testMatch: /desktop\.spec\.ts/ },
  ],
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
