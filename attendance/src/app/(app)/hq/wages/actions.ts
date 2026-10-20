"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { toUserMessage, type ActionResult } from "@/lib/errors";

const yen = z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : String(v).replace(/[,，円\s]/g, "")), z.coerce.number().int().min(0).max(10_000_000).optional());
const hours = z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), z.coerce.number().min(0).max(400).optional());

const wageFormSchema = z
  .object({
    staff_id: z.uuid(),
    valid_from: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "適用開始月を選んでください"),
    pay_type: z.enum(["monthly", "hourly", "daily"]),
    basic_wage: yen,
    qualification_allowance: yen,
    hourly_wage: yen,
    daily_wage: yen,
    monthly_hours: hours,
    overtime_threshold_hours: hours,
    fixed_overtime_allowance: yen,
    commute_type: z.enum(["none", "monthly", "per_day"]),
    commute_amount: yen,
    misc_allowance: yen,
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.pay_type === "monthly" && (v.basic_wage === undefined || !v.monthly_hours)) {
      ctx.addIssue({ code: "custom", message: "月給は基礎賃金と月の所定時間を入力してください" });
    }
    if (v.pay_type === "hourly" && v.hourly_wage === undefined) ctx.addIssue({ code: "custom", message: "時給を入力してください" });
    if (v.pay_type === "daily" && v.daily_wage === undefined) ctx.addIssue({ code: "custom", message: "日給を入力してください" });
  });

/** 賃金の登録（同じ適用開始月は上書き、別の月は履歴に追加） */
export async function saveWage(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireHq();
  const parsed = wageFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "入力が正しくありません" };
  const { staff_id, valid_from, ...v } = parsed.data;
  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("save_wage_setting", {
    p_staff_id: staff_id,
    p_values: {
      ...v,
      valid_from: `${valid_from}-01`,
      basic_wage: v.pay_type === "monthly" ? v.basic_wage : null,
      hourly_wage: v.pay_type === "hourly" ? v.hourly_wage : null,
      daily_wage: v.pay_type === "daily" ? v.daily_wage : null,
      commute_amount: v.commute_type === "none" ? 0 : (v.commute_amount ?? 0),
    },
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath("/hq/wages", "layout");
  revalidatePath("/hq/payroll");
  return { ok: true, message: `${valid_from} からの賃金を保存しました` };
}

const signedYen = z.preprocess((v) => (v === "" || v === null || v === undefined ? 0 : String(v).replace(/[,，円\s]/g, "")), z.coerce.number().int().min(-10_000_000).max(10_000_000));

const inputSchema = z.object({
  staff_id: z.uuid(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  side_job_days: z.preprocess((v) => (v === "" ? 0 : v), z.coerce.number().min(0).max(31)),
  side_job_pay: signedYen,
  year_end_adjustment: signedYen,
  absence_deduction: signedYen.pipe(z.number().min(0, "欠勤控除は0以上で入力してください")),
  misc_allowance: z.preprocess((v) => (v === "" || v === undefined ? null : String(v).replace(/[,，円\s]/g, "")), z.coerce.number().int().min(0).nullable()),
  deduction: signedYen,
  note: z.string().trim().max(500).optional(),
});

/** 月の手入力（別バイト・MG代・年末調整・欠勤控除・雑手当の上書き・控除・備考） */
export async function savePayrollInput(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireHq();
  const parsed = inputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "入力が正しくありません" };
  const { staff_id, month, ...values } = parsed.data;
  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("save_payroll_input", { p_staff_id: staff_id, p_month: `${month}-01`, p_values: values });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath("/hq/payroll");
  return { ok: true, message: "保存しました" };
}
