"use server";

import { revalidatePath } from "next/cache";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { toUserMessage, type ActionResult } from "@/lib/errors";
import { companyHolidaySchema, holidayCreditTargetSchema, parseForm } from "@/lib/validation/schemas";

export async function addCompanyHoliday(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await requireHq();
  const parsed = parseForm(companyHolidaySchema, formData);
  if (!parsed.ok) return parsed;

  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("company_holidays").insert({ ...parsed.data, created_by: actor.userId });
  if (error) {
    return { ok: false, message: error.code === "23505" ? "その日付は既に登録されています" : toUserMessage(error) };
  }
  revalidatePath("/admin/holidays");
  return { ok: true, message: `${parsed.data.holiday_date} ${parsed.data.name} を登録しました` };
}

export async function setHolidayCreditTarget(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireHq();
  const parsed = parseForm(holidayCreditTargetSchema, formData);
  if (!parsed.ok) return parsed;

  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("company_holidays")
    .update({ credit_target: parsed.data.credit_target })
    .eq("holiday_date", parsed.data.holiday_date);
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath("/admin/holidays");
  return { ok: true, message: parsed.data.credit_target ? "振休の対象にしました" : "振休の対象外にしました" };
}
