"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMe } from "@/server/session";
import { friendlyDbError } from "@/lib/db-error";
import { back } from "@/server/redirect-with";

const uuidRe = /^[0-9a-f-]{36}$/;
const timeRe = /^\d{2}:\d{2}$/;

export type HcState = { error?: string };
export async function submitHolidayChange(_prev: HcState, fd: FormData): Promise<HcState> {
  await requireMe();
  const store = String(fd.get("store_id") ?? ""), usage = String(fd.get("usage_id") ?? "");
  const start = String(fd.get("start_time") ?? ""), end = String(fd.get("end_time") ?? "");
  const brk = Number(fd.get("break_minutes") ?? 0);
  const reason = String(fd.get("reason") ?? "").trim();
  const key = String(fd.get("idempotency_key") ?? "");
  if (!uuidRe.test(store) || !uuidRe.test(usage)) return { error: "変更する振休を選んでください" };
  if (!timeRe.test(start) || !timeRe.test(end)) return { error: "勤務時間を入力してください" };
  if (!Number.isInteger(brk) || brk < 0 || brk > 240) return { error: "休憩は0〜240分です" };
  if (reason.length < 2) return { error: "申請理由を入力してください" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_holiday_change", {
    p_store: store, p_usage: usage, p_start: start, p_end: end, p_break: brk, p_reason: reason.slice(0, 500), p_idempotency_key: uuidRe.test(key) ? key : null,
  });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/holiday-change");
  redirect(`/holiday-change/${data}?ok=${encodeURIComponent("申請しました。GMの確認 → 社長の承認の順に進みます")}`);
}

export async function resubmitHolidayChange(fd: FormData) {
  const id = String(fd.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("resubmit_holiday_change", {
    p_id: id, p_start: String(fd.get("start_time")), p_end: String(fd.get("end_time")), p_break: Number(fd.get("break_minutes") ?? 0), p_reason: String(fd.get("reason") ?? ""),
  });
  if (error) back(`/holiday-change/${id}`, "err", friendlyDbError(error));
  revalidatePath(`/holiday-change/${id}`);
  back(`/holiday-change/${id}`, "ok", "再申請しました（GMの確認からやり直します）");
}

export async function withdrawHolidayChange(fd: FormData) {
  const id = String(fd.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_holiday_change", { p_id: id });
  if (error) back(`/holiday-change/${id}`, "err", friendlyDbError(error));
  revalidatePath(`/holiday-change/${id}`);
  back(`/holiday-change/${id}`, "ok", "申請を取り下げました（振休は取得予定のままです）");
}

export async function decideHolidayChange(fd: FormData) {
  await requireMe();
  const backTo = String(fd.get("back_to") || "/approvals");
  const action = String(fd.get("action"));
  if (!["approve", "return", "reject"].includes(action)) back(backTo, "err", "操作が正しくありません");
  const key = String(fd.get("idempotency_key") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_holiday_change_step", {
    p_step: String(fd.get("step_id")), p_action: action, p_reason: String(fd.get("reason") ?? "") || null,
    p_expected_version: Number(fd.get("version")) || null, p_idempotency_key: uuidRe.test(key) ? key : null,
  });
  if (error) back(backTo, "err", friendlyDbError(error));
  revalidatePath("/approvals");
  const msg = action !== "approve" ? (action === "return" ? "差戻しました" : "却下しました")
    : data === "pending_president" ? "確認しました（社長の承認待ちに進みました）" : "承認しました（変更確定・振休は使ったことになります）";
  back(backTo, "ok", msg);
}
