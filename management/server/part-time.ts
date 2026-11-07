import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PartTimeCategory } from "@/lib/part-time";
import type { RequestStatus } from "@/lib/leave/requests";

export type PartTimeRow = {
  id: string; store_id: string; worker_user_id: string | null; category: PartTimeCategory; work_date: string; start_time: string; end_time: string;
  break_minutes: number; reason: string; is_exception: boolean; exception_reason: string | null; cutoff_date: string; status: RequestStatus;
  requested_by: string; created_at: string; stores: { name: string } | null; worker: { name: string } | null;
};
export async function listPartTime(filter: { storeId?: string; limit?: number } = {}) {
  const supabase = await createClient();
  let q = supabase.from("part_time_requests")
    .select("*, stores(name), worker:users!part_time_requests_worker_user_id_fkey(name)")
    .order("work_date", { ascending: false }).limit(filter.limit ?? 100);
  if (filter.storeId) q = q.eq("store_id", filter.storeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PartTimeRow[];
}

export type PartTimeQueueRow = {
  step_id: string; step_version: number; request_id: string; store_name: string; category: PartTimeCategory; work_date: string;
  start_time: string; end_time: string; break_minutes: number; minutes: number; worker_name: string | null; reason: string;
  is_exception: boolean; exception_reason: string | null; cutoff_date: string; requested_by_name: string; submitted_at: string;
};
export async function partTimeQueue(): Promise<PartTimeQueueRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_part_time_queue");
  if (error) throw new Error(error.message);
  return (data ?? []) as PartTimeQueueRow[];
}

export async function shiftCutoffDay(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("value").eq("key", "shift_cutoff_day").maybeSingle();
  const v = Number(data?.value);
  return Number.isInteger(v) && v >= 1 && v <= 28 ? v : 20;
}

// 院長が選べるアルバイト雇用の人（見える範囲＝自院）
export async function partTimeWorkers(storeIds: string[]) {
  if (!storeIds.length) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("user_store_assignments")
    .select("store_id, users!inner(id, name, employment_type, status)")
    .in("store_id", storeIds).is("ends_on", null);
  const out = new Map<string, { id: string; name: string; storeIds: string[] }>();
  for (const r of (data ?? []) as unknown as { store_id: string; users: { id: string; name: string; employment_type: string; status: string } }[]) {
    if (r.users.employment_type !== "アルバイト" || r.users.status !== "active") continue;
    const cur = out.get(r.users.id) ?? { id: r.users.id, name: r.users.name, storeIds: [] };
    cur.storeIds.push(r.store_id);
    out.set(r.users.id, cur);
  }
  return [...out.values()];
}
