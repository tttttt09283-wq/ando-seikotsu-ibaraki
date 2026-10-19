import { expect, test, type Page } from "@playwright/test";

/**
 * 共用端末の画面フロー。端末 API（/api/kiosk/*）をモックし、Supabase なしで画面の振る舞いを検証する。
 * サーバー側の認証・二重打刻防止は DB テスト（tests/db/kiosk.test.ts）で検証している。
 */

const TOKEN = "a".repeat(64);

async function mockKiosk(page: Page, options: { punchFails?: boolean; mustChangePin?: boolean } = {}) {
  const calls: { url: string; body: unknown }[] = [];
  await page.route("**/api/kiosk/**", async (route) => {
    const url = route.request().url();
    const body = route.request().postDataJSON?.() ?? null;
    calls.push({ url, body });
    if (url.endsWith("/status")) {
      return route.fulfill({ json: { ok: true, serverTime: new Date().toISOString(), clinicName: "茨木院", deviceName: "受付タブレット" } });
    }
    if (url.endsWith("/auth")) {
      const { pin } = body as { pin: string };
      if (pin !== "482916") return route.fulfill({ status: 401, json: { ok: false, error: "invalid", remaining: 4 } });
      return route.fulfill({ json: { ok: true, sessionToken: TOKEN, staffName: "安藤 太郎", state: "off", mustChangePin: options.mustChangePin ?? false } });
    }
    if (url.endsWith("/leave/balances")) {
      return route.fulfill({ json: { ok: true, paid: 8.5, holidayCredit: 1, halfDay: true } });
    }
    if (url.endsWith("/leave/request")) {
      return route.fulfill({ json: { ok: true } });
    }
    if (url.endsWith("/punch")) {
      if (options.punchFails) return route.abort("internetdisconnected");
      return route.fulfill({ json: { ok: true, duplicate: false, punchType: "clock_in", punchedAt: "2026-10-19T00:01:00Z", staffName: "安藤 太郎" } });
    }
    return route.fulfill({ status: 404, json: { ok: false } });
  });
  return calls;
}

async function enterDigits(page: Page, digits: string) {
  for (const d of digits) await page.getByRole("button", { name: d, exact: true }).click();
}

async function login(page: Page, pin = "482916") {
  await page.getByRole("button", { name: "打刻する" }).click();
  await enterDigits(page, "1001");
  await page.getByRole("button", { name: "次へ" }).click();
  await enterDigits(page, pin);
  await page.getByRole("button", { name: "確認" }).click();
}

test.describe("共用端末（キオスク）", () => {
  test("未登録の端末は登録コードの入力画面になり、管理画面へのリンクを持たない", async ({ page }) => {
    await page.route("**/api/kiosk/status", (route) => route.fulfill({ json: { ok: false, error: "unregistered", serverTime: new Date().toISOString() } }));
    await page.goto("/kiosk");
    await expect(page.getByRole("heading", { name: "打刻端末" })).toBeVisible();
    await expect(page.getByLabel("登録コード")).toBeVisible();
    await expect(page.locator("a")).toHaveCount(0);
  });

  test("必須テスト5：打刻後は自動で待受画面に戻り、前の人の氏名・認証情報が残らない", async ({ page }) => {
    const calls = await mockKiosk(page);
    await page.goto("/kiosk");
    await expect(page.getByText("茨木院")).toBeVisible();
    await login(page);

    await expect(page.getByText("安藤 太郎さん")).toBeVisible();
    await expect(page.getByRole("button", { name: "退勤" })).toBeDisabled(); // 勤務外なので出勤のみ
    await page.getByRole("button", { name: "出勤" }).click();
    await expect(page.getByRole("status")).toContainText("出勤");

    // 端末の時刻は送るが、打刻時刻として採用するのはサーバーの応答
    const punchCall = calls.find((c) => c.url.endsWith("/punch"));
    expect(punchCall?.body).toMatchObject({ sessionToken: TOKEN, punchType: "clock_in" });

    await expect(page.getByRole("button", { name: "打刻する" })).toBeVisible({ timeout: 8000 });
    await expect(page.locator("body")).not.toContainText("安藤");
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    expect(storage).not.toContain(TOKEN);
    expect(storage).not.toContain("482916");
  });

  test("PINを間違えると残り回数を表示し、自動で待受画面に戻る", async ({ page }) => {
    await mockKiosk(page);
    await page.goto("/kiosk");
    await login(page, "111222");
    await expect(page.getByText("スタッフIDまたはPINが正しくありません（あと4回でロックされます）")).toBeVisible();
    await expect(page.getByRole("button", { name: "打刻する" })).toBeVisible({ timeout: 8000 });
  });

  test("操作の途中で放置すると30秒で待受画面に戻る", async ({ page }) => {
    await mockKiosk(page);
    await page.clock.install();
    await page.goto("/kiosk");
    await login(page);
    await expect(page.getByText("安藤 太郎さん")).toBeVisible();
    await page.clock.runFor(31_000);
    await expect(page.getByRole("button", { name: "打刻する" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("安藤");
  });

  test("通信障害時は送信待ちに保存し、件数を表示する（氏名・PINは保存しない）", async ({ page }) => {
    await mockKiosk(page, { punchFails: true });
    await page.goto("/kiosk");
    await login(page);
    await page.getByRole("button", { name: "出勤" }).click();
    await expect(page.getByRole("status")).toContainText("送信待ちに保存しました");
    await expect(page.getByText("送信待ち 1件")).toBeVisible();
    const saved = await page.evaluate(() => localStorage.getItem("ando_kiosk_pending_punches") ?? "");
    expect(saved).toContain("clock_in");
    expect(saved).not.toContain("安藤");
    expect(saved).not.toContain("482916");
  });

  test("休暇申請：本人確認後に残数を表示し、申請すると自動で待受画面に戻る", async ({ page }) => {
    const calls = await mockKiosk(page);
    await page.goto("/kiosk");
    await page.getByRole("button", { name: "休暇申請" }).click();
    await enterDigits(page, "1001");
    await page.getByRole("button", { name: "次へ" }).click();
    await enterDigits(page, "482916");
    await page.getByRole("button", { name: "確認" }).click();

    await expect(page.getByText("安藤 太郎さん：休暇申請")).toBeVisible();
    await expect(page.getByText("使用可能：8.5日")).toBeVisible();
    await page.getByRole("button", { name: "振休" }).click();
    await expect(page.getByText("使用可能：1日")).toBeVisible();
    await page.getByRole("button", { name: "午前半休" }).click();
    await page.getByRole("button", { name: "申請する" }).click();

    await expect(page.getByRole("status")).toContainText("休暇を申請しました");
    const body = calls.find((c) => c.url.endsWith("/leave/request"))?.body as Record<string, unknown>;
    expect(body).toMatchObject({ sessionToken: TOKEN, leaveType: "holiday_credit", unit: "am" });
    await expect(page.getByRole("button", { name: "打刻する" })).toBeVisible({ timeout: 8000 });
    await expect(page.locator("body")).not.toContainText("安藤");
  });
});
