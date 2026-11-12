import type { Repo } from "@/lib/repo/types";
import type { AdminContext } from "@/lib/auth/permissions";

/** 2026-11-12(木) 09:00 JST */
export const NOW = new Date("2026-11-12T00:00:00Z");
/** 受付締切（24時間前）を十分に過ぎていない月曜日 */
export const DAY = "2026-11-16";

export const OWNER: AdminContext = {
  id: "a1",
  email: "owner@example.com",
  display_name: "岩永",
  role: "owner",
  allowed_controllers: ["iwanaga_private", "enejoy_hand"],
  can_export: true,
};
export const STAFF_PRIVATE_ONLY: AdminContext = { ...OWNER, id: "a2", email: "staff@example.com", role: "staff", allowed_controllers: ["iwanaga_private"], can_export: false };

export async function openHome(repo: Repo) {
  await repo.updateLocation("home", { opening_ready: true, booking_enabled: true });
  for (const s of await repo.listServices("home")) await repo.updateService(s.id, { price_status: "approved", is_published: true });
}

/** 勤務先を会社承認済みにして、会社承認済みメニューを登録する */
export async function openWorkplace(repo: Repo, id: "ibaraki" | "korien") {
  await repo.updateLocation(id, { company_approved: true, company_approved_at: NOW.toISOString(), company_approval_note: "テスト承認", booking_enabled: true });
  for (const weekday of [1, 2, 3, 4, 5]) await repo.insertRule({ location_id: id, weekday, specific_date: null, start_time: "09:00", end_time: "20:00", is_closed: false, note: null });
  return repo.insertService({ location_id: id, controller: "enejoy_hand", name: "鍼灸", description: "", duration_minutes: 60, price_tax_included: 5000, price_status: "approved", price_approval_note: "会社承認", is_published: true, sort_order: 1 });
}

export async function homeService(repo: Repo, name = "通常") {
  const s = (await repo.listServices("home")).find((x) => x.name === name);
  if (!s) throw new Error("service not found");
  return s;
}

export function input(over: Record<string, unknown> = {}) {
  return {
    location_id: "home",
    service_id: "",
    date: DAY,
    time: "10:00",
    name: "山田 花子",
    phone: "090-1234-5678",
    consultation: "肩こり",
    agree_privacy: true,
    agree_cancel_policy: true,
    source: "threads",
    ...over,
  };
}

export const LINE_USER = "U" + "a".repeat(32);
export const LINE_USER_2 = "U" + "b".repeat(32);

export function setLineEnv(on: boolean) {
  if (on) {
    process.env.LINE_CHANNEL_SECRET = "test-channel-secret";
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "test-access-token";
    process.env.LINE_BOT_USER_ID = "U" + "f".repeat(32);
    process.env.NEXT_PUBLIC_LINE_BASIC_ID = "@iwanaga";
  } else {
    delete process.env.LINE_CHANNEL_SECRET;
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
    delete process.env.LINE_BOT_USER_ID;
    delete process.env.NEXT_PUBLIC_LINE_BASIC_ID;
  }
}

/** LINE API のモック。送ったメッセージを記録し、fail=true なら 500 を返す */
export function lineMock() {
  const calls: Array<{ url: string; body: { to?: string; replyToken?: string; messages: Array<{ text: string }> }; retryKey?: string }> = [];
  const state = { fail: false };
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)), retryKey: (init.headers as Record<string, string>)["X-Line-Retry-Key"] });
    return state.fail ? new Response("error", { status: 500 }) : new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, state, fetcher };
}
