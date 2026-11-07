import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { RequestStatus } from "@/lib/leave/requests";

export type LeaveRequestRow = {
  id: string; user_id: string; store_id: string; kind: "PAID" | "SHIFT"; dates: string[]; total_days: number; reason: string | null;
  status: RequestStatus; balance_shortage: boolean; exception_note: string | null; submitted_by: string; created_at: string; updated_at: string;
  users: { name: string } | null; stores: { name: string } | null;
};

export async function listRequests(filter: { userId?: string; storeId?: string; limit?: number } = {}) {
  const supabase = await createClient();
  let q = supabase.from("leave_requests")
    .select("id, user_id, store_id, kind, dates, total_days, reason, status, balance_shortage, exception_note, submitted_by, created_at, updated_at, users!leave_requests_user_id_fkey(name), stores(name)")
    .order("created_at", { ascending: false }).limit(filter.limit ?? 50);
  if (filter.userId) q = q.eq("user_id", filter.userId);
  if (filter.storeId) q = q.eq("store_id", filter.storeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as LeaveRequestRow[];
}

export type QueueRow = {
  step_id: string; step_version: number; request_id: string; kind: "PAID" | "SHIFT"; user_id: string; user_name: string; store_name: string;
  dates: string[]; total_days: number; reason: string | null; balance_shortage: boolean; exception_note: string | null;
  submitted_by_name: string; submitted_at: string; self_approval: boolean; available: number; pending_other: number;
};
export async function approvalQueue(): Promise<QueueRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_approval_queue");
  if (error) throw new Error(error.message);
  return (data ?? []) as QueueRow[];
}

export async function unreadNotifications(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return count ?? 0;
}
