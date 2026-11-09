"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireMe, requireRecentLogin } from "@/server/session";
import { friendlyDbError } from "@/lib/db-error";
import { formToObject, firstError } from "@/lib/validation";
import { back } from "@/server/redirect-with";

const uuidRe = /^[0-9a-f-]{36}$/;
const schema = z.object({
  store_id: z.string().uuid("院を選んでください"),
  category: z.enum(["plan", "help", "busy"], { message: "申請区分を選んでください" }),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "勤務日を入力してください"),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, "開始時刻を入力してください"),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, "終了時刻を入力してください"),
  break_minutes: z.coerce.number().int().min(0).max(240).default(0),
  reason: z.string().trim().min(2, "申請理由を入力してください").max(500),
  worker_user_id: z.string().optional().transform((v) => (v && uuidRe.test(v) ? v : null)),
  exception_reason: z.string().trim().max(500).optional().transform((v) => v || null),
  idempotency_key: z.string().optional(),
});

export type PartTimeState = { error?: string };
export async function submitPartTime(_prev: PartTimeState, fd: FormData): Promise<PartTimeState> {
  await requireMe();
  const p = schema.safeParse(formToObject(fd));
  if (!p.success) return { error: firstError(p.error) };
  const v = p.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_part_time_request", {
    p_store: v.store_id, p_category: v.category, p_work_date: v.work_date, p_start: v.start_time, p_end: v.end_time, p_break: v.break_minutes,
    p_reason: v.reason, p_worker: v.worker_user_id, p_exception_reason: v.exception_reason, p_idempotency_key: v.idempotency_key && uuidRe.test(v.idempotency_key) ? v.idempotency_key : null,
  });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/part-time");
  redirect(`/part-time/${data}?ok=${encodeURIComponent("申請しました。社長の承認をお待ちください")}`);
}

export async function resubmitPartTime(fd: FormData) {
  const id = String(fd.get("id"));
  const path = `/part-time/${id}`;
  const p = schema.omit({ store_id: true }).safeParse(formToObject(fd));
  if (!p.success) back(path, "err", firstError(p.error));
  const v = p.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("resubmit_part_time_request", {
    p_id: id, p_category: v.category, p_work_date: v.work_date, p_start: v.start_time, p_end: v.end_time, p_break: v.break_minutes,
    p_reason: v.reason, p_worker: v.worker_user_id, p_exception_reason: v.exception_reason,
  });
  if (error) back(path, "err", friendlyDbError(error));
  revalidatePath(path);
  back(path, "ok", "再申請しました");
}

export async function assignWorker(fd: FormData) {
  const id = String(fd.get("id"));
  const path = `/part-time/${id}`;
  const w = String(fd.get("worker_user_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_part_time_worker", { p_id: id, p_worker: uuidRe.test(w) ? w : null });
  if (error) back(path, "err", friendlyDbError(error));
  revalidatePath(path);
  back(path, "ok", "勤務する人を設定しました");
}

export async function withdrawPartTime(fd: FormData) {
  const id = String(fd.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_part_time_request", { p_id: id });
  if (error) back(`/part-time/${id}`, "err", friendlyDbError(error));
  revalidatePath(`/part-time/${id}`);
  back(`/part-time/${id}`, "ok", "申請を取り下げました");
}

export async function cancelPartTime(fd: FormData) {
  const id = String(fd.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_part_time_request", { p_id: id, p_reason: String(fd.get("reason") ?? "") });
  if (error) back(`/part-time/${id}`, "err", friendlyDbError(error));
  revalidatePath(`/part-time/${id}`);
  back(`/part-time/${id}`, "ok", "取り消しました");
}

export async function decidePartTime(fd: FormData) {
  await requireRecentLogin(String(fd.get("back_to") || "/approvals"));
  await requireMe();
  const backTo = String(fd.get("back_to") || "/approvals");
  const action = String(fd.get("action"));
  if (!["approve", "return", "reject"].includes(action)) back(backTo, "err", "操作が正しくありません");
  const key = String(fd.get("idempotency_key") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_part_time_step", {
    p_step: String(fd.get("step_id")), p_action: action, p_reason: String(fd.get("reason") ?? "") || null,
    p_expected_version: Number(fd.get("version")) || null, p_idempotency_key: uuidRe.test(key) ? key : null,
  });
  if (error) back(backTo, "err", friendlyDbError(error));
  revalidatePath("/approvals");
  back(backTo, "ok", action === "approve" ? "承認しました（勤務予定に確定）" : action === "return" ? "差戻しました" : "却下しました");
}

export async function updateCutoff(fd: FormData) {
  const day = Number(fd.get("day"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_setting", { p_key: "shift_cutoff_day", p_value: day });
  if (error) back("/admin/stores", "err", friendlyDbError(error));
  revalidatePath("/admin/stores");
  back("/admin/stores", "ok", `シフト確定の基準日を前月${day}日にしました`);
}
