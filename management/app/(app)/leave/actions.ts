"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMe, requireRecentLogin } from "@/server/session";
import { friendlyDbError } from "@/lib/db-error";
import { normalizeDates, REJECT_CATEGORIES } from "@/lib/leave/requests";
import { back } from "@/server/redirect-with";

export type SubmitState = { error?: string };

const uuidRe = /^[0-9a-f-]{36}$/;

// 申請（権限・残数・二重申請の判定は DB の submit_leave_request が行う）
export async function submitLeave(_prev: SubmitState, fd: FormData): Promise<SubmitState> {
  const me = await requireMe();
  const kind = String(fd.get("kind"));
  const userId = String(fd.get("user_id") || me.id);
  const dates = normalizeDates(fd.getAll("dates").map(String));
  const reason = String(fd.get("reason") ?? "").slice(0, 500);
  const note = String(fd.get("exception_note") ?? "").slice(0, 500);
  const key = String(fd.get("idempotency_key") ?? "");
  if (kind !== "PAID" && kind !== "SHIFT") return { error: "有給か振休を選んでください" };
  if (!uuidRe.test(userId)) return { error: "スタッフの選択が正しくありません" };
  if (!dates.length) return { error: "休む日を選んでください" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_leave_request", {
    p_user: userId, p_kind: kind, p_dates: dates, p_reason: reason || null, p_exception_note: note || null, p_idempotency_key: uuidRe.test(key) ? key : null,
  });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/leave");
  redirect(`/leave/${data}?ok=${encodeURIComponent("申請しました。承認をお待ちください")}`);
}

export async function withdrawLeave(fd: FormData) {
  const id = String(fd.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_leave_request", { p_request: id });
  if (error) back(`/leave/${id}`, "err", friendlyDbError(error));
  revalidatePath(`/leave/${id}`);
  back(`/leave/${id}`, "ok", "申請を取り下げました");
}

export async function cancelLeave(fd: FormData) {
  const id = String(fd.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_leave_request", { p_request: id, p_reason: String(fd.get("reason") ?? "") });
  if (error) back(`/leave/${id}`, "err", friendlyDbError(error));
  revalidatePath(`/leave/${id}`);
  back(`/leave/${id}`, "ok", "取り消しました（残数を戻しました）");
}

export async function resubmitLeave(fd: FormData) {
  const id = String(fd.get("id"));
  const dates = normalizeDates(fd.getAll("dates").map(String));
  if (!dates.length) back(`/leave/${id}`, "err", "休む日を選んでください");
  const supabase = await createClient();
  const { error } = await supabase.rpc("resubmit_leave_request", {
    p_request: id, p_dates: dates, p_reason: String(fd.get("reason") ?? "") || null, p_exception_note: String(fd.get("exception_note") ?? "") || null,
  });
  if (error) back(`/leave/${id}`, "err", friendlyDbError(error));
  revalidatePath(`/leave/${id}`);
  back(`/leave/${id}`, "ok", "再申請しました");
}

// 承認・差戻し・却下（権限・自己承認・順序・バージョンの判定は DB の decide_leave_step が行う）
export async function decideLeave(fd: FormData) {
  await requireRecentLogin(String(fd.get("back_to") || "/approvals"));
  await requireMe();
  const backTo = String(fd.get("back_to") || "/approvals");
  const action = String(fd.get("action"));
  const category = String(fd.get("reason_category") ?? "");
  if (!["approve", "return", "reject"].includes(action)) back(backTo, "err", "操作が正しくありません");
  if (category && !(REJECT_CATEGORIES as readonly string[]).includes(category)) back(backTo, "err", "理由の区分が正しくありません");
  const key = String(fd.get("idempotency_key") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_leave_step", {
    p_step: String(fd.get("step_id")), p_action: action, p_reason: String(fd.get("reason") ?? "") || null,
    p_reason_category: category || null, p_expected_version: Number(fd.get("version")) || null, p_idempotency_key: uuidRe.test(key) ? key : null,
  });
  if (error) back(backTo, "err", friendlyDbError(error));
  revalidatePath("/approvals");
  back(backTo, "ok", action === "approve" ? "承認しました" : action === "return" ? "差戻しました" : "却下しました");
}

export async function markNotificationsRead() {
  const me = await requireMe();
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", me.id).is("read_at", null);
  revalidatePath("/notifications");
}
