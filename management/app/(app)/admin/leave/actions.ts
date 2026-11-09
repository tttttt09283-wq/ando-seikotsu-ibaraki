"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, ForbiddenError, requireRecentLogin } from "@/server/session";
import { friendlyDbError } from "@/lib/db-error";
import { firstError, formToObject } from "@/lib/validation";
import { back } from "@/server/redirect-with";

async function guard(path: string) {
  try { await requirePermission("leave.adjust"); } catch (e) {
    if (e instanceof ForbiddenError) back(path, "err", e.message);
    throw e;
  }
}
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付を入力してください");
const halfDays = z.coerce.number().refine((v) => Number.isFinite(v) && v * 2 === Math.round(v * 2), "日数は0.5日刻みです");

// 残数の修正（理由必須。記録は消せない）
const adjustSchema = z.object({
  grant_id: z.string().uuid("付与を選んでください"),
  delta: halfDays.refine((v) => v !== 0 && Math.abs(v) <= 40, "修正日数を入れてください（例：+1、-0.5）"),
  reason: z.string().trim().min(2, "修正理由を入れてください").max(300),
});
export async function adjustLeave(fd: FormData) {
  await requireRecentLogin("/admin/leave");
  const userId = String(fd.get("user_id") ?? "");
  const path = `/staff/${userId}/leave`;
  await guard(path);
  const p = adjustSchema.safeParse(formToObject(fd));
  if (!p.success) back(path, "err", firstError(p.error));
  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_leave", { p_grant: p.data.grant_id, p_delta: p.data.delta, p_reason: p.data.reason });
  if (error) back(path, "err", friendlyDbError(error));
  revalidatePath(path);
  back(path, "ok", `残数を${p.data.delta > 0 ? "+" : ""}${p.data.delta}日 修正しました`);
}

// 付与（法定付与の確定・会社独自の付与・振休の発生）
const grantSchema = z.object({
  user_id: z.string().uuid("スタッフを選んでください"),
  type_code: z.enum(["PAID", "SHIFT", "SHIFT_HOLIDAY"], { message: "区分を選んでください" }),
  grant_date: date,
  days: halfDays.refine((v) => v > 0 && v <= 40, "日数は0.5〜40日です"),
  source: z.enum(["statutory", "company", "shift_earned", "manual"]),
  note: z.string().trim().max(300).optional(),
  attendance_checked: z.string().optional(),
  back_to: z.string().optional(),
});
export async function addGrant(fd: FormData) {
  const raw = formToObject(fd);
  const path = raw.back_to === "staff" ? `/staff/${raw.user_id}/leave` : "/admin/leave";
  await guard(path);
  const p = grantSchema.safeParse(raw);
  if (!p.success) back(path, "err", firstError(p.error));
  const g = p.data;
  if (g.source === "statutory" && g.attendance_checked !== "on") back(path, "err", "出勤率8割以上を確認してから付与してください");
  if ((g.type_code === "SHIFT" || g.type_code === "SHIFT_HOLIDAY") && g.source !== "shift_earned") back(path, "err", "振休は「振休の発生」として登録してください");
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_leave_grant", {
    p_user: g.user_id, p_type_code: g.type_code, p_grant_date: g.grant_date, p_days: g.days, p_source: g.source,
    p_origin_work_date: g.type_code === "PAID" ? null : g.grant_date, p_note: g.note ?? null, p_prior_taken: 0,
  });
  if (error) back(path, "err", friendlyDbError(error));
  revalidatePath(path);
  revalidatePath("/admin/leave");
  back(path, "ok", `${g.days}日を付与しました`);
}

// 振休の発生（公休出勤・祝日出勤）の登録：自院の院長・社長（権限は DB の register_shift_earned でも確認）
const shiftSchema = z.object({
  user_id: z.string().uuid(),
  type_code: z.enum(["SHIFT", "SHIFT_HOLIDAY"], { message: "区分を選んでください" }),
  work_date: date,
  note: z.string().trim().max(300).optional(),
});
export async function registerShift(fd: FormData) {
  const raw = formToObject(fd);
  const path = `/staff/${raw.user_id}/leave`;
  const p = shiftSchema.safeParse(raw);
  if (!p.success) back(path, "err", firstError(p.error));
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("can_register_shift_for", { p_user: p.data.user_id });
  if (!allowed) back(path, "err", "この人の振休を登録する権限がありません");
  const { error } = await supabase.rpc("register_shift_earned", { p_user: p.data.user_id, p_type_code: p.data.type_code, p_work_date: p.data.work_date, p_note: p.data.note ?? null });
  if (error) back(path, "err", friendlyDbError(error));
  revalidatePath(path);
  back(path, "ok", `${p.data.work_date} の出勤による振休を1日登録しました`);
}
