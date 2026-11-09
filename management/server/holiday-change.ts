import "server-only";
import { createClient } from "@/lib/supabase/server";

export type HcStatus = "pending_gm" | "pending_president" | "returned" | "approved" | "rejected" | "withdrawn";
export const HC_STATUS: Record<HcStatus, { text: string; tone: "warn" | "ok" | "danger" | "neutral" | "brand" }> = {
  pending_gm: { text: "GM確認待ち", tone: "warn" },
  pending_president: { text: "社長承認待ち（GM確認済み）", tone: "warn" },
  returned: { text: "差戻し", tone: "brand" },
  approved: { text: "変更確定", tone: "ok" },
  rejected: { text: "却下", tone: "danger" },
  withdrawn: { text: "取下げ", tone: "neutral" },
};

export type HcRow = {
  id: string; store_id: string; target_user_id: string; shift_holiday_date: string; start_time: string; end_time: string; break_minutes: number;
  reason: string; status: HcStatus; created_at: string; stores: { name: string } | null; target: { name: string } | null;
};
export async function listHolidayChanges(filter: { storeId?: string; limit?: number } = {}) {
  const supabase = await createClient();
  let q = supabase.from("holiday_change_requests").select("*, stores(name), target:users!holiday_change_requests_target_user_id_fkey(name)")
    .order("shift_holiday_date", { ascending: false }).limit(filter.limit ?? 100);
  if (filter.storeId) q = q.eq("store_id", filter.storeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as HcRow[];
}

export type HcQueueRow = {
  step_id: string; step_version: number; step_kind: "gm_review" | "president_final"; request_id: string; store_name: string; target_name: string;
  shift_holiday_date: string; start_time: string; end_time: string; break_minutes: number; minutes: number; reason: string;
  requested_by_name: string; submitted_at: string; gm_comment: string | null;
};
export async function holidayChangeQueue(): Promise<HcQueueRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_holiday_change_queue");
  if (error) throw new Error(error.message);
  return (data ?? []) as HcQueueRow[];
}

export type Candidate = { usage_id: string; user_id: string; user_name: string; usage_date: string; type_code: "SHIFT" | "SHIFT_HOLIDAY"; leave_request_id: string };
export async function holidayChangeCandidates(storeId: string): Promise<Candidate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("holiday_change_candidates", { p_store: storeId });
  if (error) throw new Error(error.message);
  return (data ?? []) as Candidate[];
}
