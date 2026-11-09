"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMe } from "@/server/session";
import { friendlyDbError } from "@/lib/db-error";
import { back } from "@/server/redirect-with";

const uuidRe = /^[0-9a-f-]{36}$/;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export type MeetingFormState = { error?: string };
export async function createMeeting(_prev: MeetingFormState, fd: FormData): Promise<MeetingFormState> {
  await requireMe();
  const store = String(fd.get("store_id") ?? ""), held = String(fd.get("held_on") ?? ""), title = String(fd.get("title") ?? "").trim();
  if (!uuidRe.test(store)) return { error: "院を選んでください" };
  if (!dateRe.test(held)) return { error: "開催日を入力してください" };
  if (title.length < 2) return { error: "会議名を入力してください" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_meeting", { p_store: store, p_held_on: held, p_title: title.slice(0, 100) });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/meetings");
  redirect(`/meetings/${data}?ok=${encodeURIComponent("会議を登録しました。開催後、期限までに議事録を提出してください")}`);
}

export async function updateMeeting(fd: FormData) {
  const id = Number(fd.get("id"));
  const supabase = await createClient();
  const store = String(fd.get("store_id") ?? "");
  const { error } = await supabase.rpc("update_meeting", { p_id: id, p_held_on: String(fd.get("held_on") || "") || null, p_title: String(fd.get("title") ?? ""), p_store: uuidRe.test(store) ? store : null });
  if (error) back(`/meetings/${id}`, "err", friendlyDbError(error));
  revalidatePath(`/meetings/${id}`);
  back(`/meetings/${id}`, "ok", "会議を変更しました（提出期限も開催日に合わせて変わります）");
}

export async function deleteMeeting(fd: FormData) {
  const id = Number(fd.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_meeting", { p_id: id });
  if (error) back(`/meetings/${id}`, "err", friendlyDbError(error));
  revalidatePath("/meetings");
  back("/meetings", "ok", "会議を削除しました");
}

export type MinutesState = { error?: string; ok?: string };
export async function saveMinutes(_prev: MinutesState, fd: FormData): Promise<MinutesState> {
  await requireMe();
  const id = Number(fd.get("id"));
  const submit = fd.get("intent") === "submit";
  let decisions: unknown;
  try { decisions = JSON.parse(String(fd.get("decisions") || "[]")); } catch { return { error: "決定事項の形式が正しくありません" }; }
  if (!Array.isArray(decisions) || decisions.length > 50) return { error: "決定事項は50件までです" };
  let attendees: string[] = [];
  try { const a = JSON.parse(String(fd.get("attendees_json") || "[]")); if (Array.isArray(a)) attendees = a.map(String).filter((x) => uuidRe.test(x)); } catch { return { error: "参加者の形式が正しくありません" }; }
  const guests = String(fd.get("guests") ?? "").split(/[\n、,]/).map((s) => s.trim()).filter(Boolean).slice(0, 30);
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_minutes", {
    p_id: id, p_agenda: String(fd.get("agenda") ?? "").slice(0, 5000), p_content: String(fd.get("content") ?? "").slice(0, 20000),
    p_attendees: attendees, p_guests: guests, p_decisions: decisions, p_no_decisions: fd.get("no_decisions") === "on", p_submit: submit,
  });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath(`/meetings/${id}`);
  revalidatePath("/meetings");
  if (submit) redirect(`/meetings/${id}?ok=${encodeURIComponent("議事録を提出しました。決定事項は担当者のタスクに表示されます")}`);
  return { ok: "下書きを保存しました（まだ提出されていません）" };
}
