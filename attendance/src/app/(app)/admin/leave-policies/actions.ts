"use server";

import { revalidatePath } from "next/cache";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { toUserMessage, type ActionResult } from "@/lib/errors";
import { holidayCreditPolicySchema, leavePolicySchema, parseForm } from "@/lib/validation/schemas";

export async function saveLeavePolicy(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await requireHq();
  const parsed = parseForm(leavePolicySchema, formData);
  if (!parsed.ok) return parsed;
  const { leave_type, ...values } = parsed.data;
  if (values.hourly_allowed && leave_type !== "paid") return { ok: false, message: "時間単位は有給休暇のみ設定できます" };
  if (values.hourly_allowed && !values.agreement_note) return { ok: false, message: "時間単位年休を有効にするには、労使協定の内容（締結日など）を記入してください" };
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("leave_policies").update({ ...values, updated_by: actor.userId }).eq("leave_type", leave_type);
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath("/admin/leave-policies");
  return { ok: true, message: "保存しました" };
}

export async function saveHolidayCreditPolicy(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await requireHq();
  const parsed = parseForm(holidayCreditPolicySchema, formData);
  if (!parsed.ok) return parsed;
  const { credit_type, ...values } = parsed.data;
  if (values.expiration_rule === "days" && !values.expiration_days) return { ok: false, message: "期限の日数を入力してください" };
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("holiday_credit_policies")
    .update({ ...values, expiration_days: values.expiration_rule === "days" ? values.expiration_days : null, updated_by: actor.userId })
    .eq("credit_type", credit_type);
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath("/admin/leave-policies");
  return { ok: true, message: "保存しました" };
}
