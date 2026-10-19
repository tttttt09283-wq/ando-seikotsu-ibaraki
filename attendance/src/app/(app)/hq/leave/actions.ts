"use server";

import { revalidatePath } from "next/cache";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { toUserMessage, type ActionResult } from "@/lib/errors";
import { eligibilitySchema, paidAdjustSchema, paidGrantSchema, parseForm } from "@/lib/validation/schemas";

const revalidateLeave = (staffId?: string) => {
  revalidatePath("/hq/leave");
  if (staffId) {
    revalidatePath(`/hq/leave/${staffId}`);
    revalidatePath(`/admin/staff/${staffId}`);
  }
};

/** 有給休暇の付与（法定・比例・前倒し・手動・移行）。有効期限は空欄なら付与日から2年 */
export async function grantPaidLeave(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireHq();
  const parsed = parseForm(paidGrantSchema, formData);
  if (!parsed.ok) return parsed;
  const d = parsed.data;
  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("grant_paid_leave", {
    p_staff_id: d.staff_id,
    p_grant_date: d.grant_date,
    p_days: d.days,
    p_grant_type: d.grant_type,
    p_expiration_date: d.expiration_date,
    p_note: d.note,
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidateLeave(d.staff_id);
  return { ok: true, message: `${d.grant_date} 付で ${d.days}日を付与しました` };
}

export async function adjustPaidLeave(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireHq();
  const parsed = parseForm(paidAdjustSchema, formData);
  if (!parsed.ok) return parsed;
  const d = parsed.data;
  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("adjust_paid_leave", {
    p_grant_id: d.leave_grant_id,
    p_days: d.days,
    p_effective_date: d.effective_date,
    p_reason: d.reason,
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidateLeave(d.staff_id);
  return { ok: true, message: "残数を調整しました（理由は監査ログに残ります）" };
}

export async function expirePaidLeave(): Promise<ActionResult> {
  await requireHq();
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("expire_paid_leave", { p_as_of: null });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidateLeave();
  return { ok: true, message: Number(data) > 0 ? `期限切れの有給 ${Number(data)}日を失効として記録しました` : "失効対象の有給はありませんでした" };
}

export async function setEligibility(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireHq();
  const parsed = parseForm(eligibilitySchema, formData);
  if (!parsed.ok) return parsed;
  const d = parsed.data;
  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("set_holiday_credit_eligibility", {
    p_staff_id: d.staff_id,
    p_eligible: d.eligible,
    p_valid_from: d.valid_from,
    p_reason: d.reason,
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidateLeave(d.staff_id);
  return { ok: true, message: d.eligible ? "振休の付与対象にしました" : "振休の付与対象外にしました" };
}
