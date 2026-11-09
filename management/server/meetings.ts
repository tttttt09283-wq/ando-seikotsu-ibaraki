import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MeetingStatus, TaskStatus } from "@/lib/meetings";

export type MeetingRow = {
  id: number; held_on: string; title: string; store_id: string | null; store_name: string | null; status: MeetingStatus; minutes_due_at: string;
  minutes_submitted_at: string | null; submitted_late: boolean; decision_count: number; open_decisions: number; has_draft: boolean; can_edit: boolean;
};
export async function listMeetings(filter: { storeId?: string; from?: string; to?: string } = {}): Promise<MeetingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_meetings", { p_store: filter.storeId ?? null, p_from: filter.from ?? null, p_to: filter.to ?? null });
  if (error) throw new Error(error.message);
  return (data ?? []) as MeetingRow[];
}

export type Decision = { id: number; title: string; detail: string | null; owner_user_id: string | null; owner_name: string | null; due_date: string | null; status: TaskStatus; progress: number; is_decision: boolean };
export type MeetingDetail = {
  id: number; held_on: string; title: string; notes: string | null; store_id: string | null; store_name: string | null; status: MeetingStatus;
  minutes_due_at: string; submitted_at: string | null; submitted_late: boolean; no_decisions: boolean; can_edit: boolean; from_pos: boolean;
  minutes: { agenda: string; content: string; revision: number; updated_at: string; submitted_by_name: string | null } | null;
  attendees: { user_id: string | null; name: string; guest: boolean }[];
  decisions: Decision[];
  revisions: { revision: number; submitted_at: string; late: boolean; submitted_by_name: string }[];
};
export async function getMeeting(id: number): Promise<MeetingDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_meeting", { p_id: id });
  if (error) throw new Error(error.message);
  return (data as MeetingDetail | null) ?? null;
}

export type Member = { user_id: string; name: string; role_code: string };
export async function storeMembers(storeId: string): Promise<Member[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("store_members", { p_store: storeId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Member[]).sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

// 権限のある院（会議の登録・タスクの管理）
export async function storesWith(permission: string): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("stores").select("id, name").eq("is_active", true).order("display_order");
  const out: { id: string; name: string }[] = [];
  for (const s of data ?? []) {
    const { data: ok } = await supabase.rpc("can", { p_permission: permission, p_store: s.id });
    if (ok) out.push(s);
  }
  return out;
}

export type TaskRow = {
  id: number; title: string; detail: string | null; due_date: string | null; status: TaskStatus; progress: number; progress_note: string | null;
  priority: "high" | "mid" | "low"; is_decision: boolean; meeting_id: number | null; meeting_title: string | null; updated_at: string;
  store_name?: string | null; meeting_held_on?: string | null; owner_user_id?: string | null; owner_name?: string | null;
};
export async function myTasks(includeDone = false): Promise<TaskRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_tasks", { p_include_done: includeDone });
  if (error) throw new Error(error.message);
  return (data ?? []) as TaskRow[];
}
export async function storeTasks(storeId: string, includeDone = false): Promise<TaskRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("store_tasks", { p_store: storeId, p_include_done: includeDone });
  if (error) throw new Error(error.message);
  return (data ?? []) as TaskRow[];
}
