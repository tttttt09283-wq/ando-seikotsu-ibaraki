"use server";

import { revalidatePath } from "next/cache";
import { requireClinicManager, requireHq, requireManager } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { toUserMessage, type ActionResult } from "@/lib/errors";
import { leaveDecisionSchema, leaveRequestSchema, parseForm } from "@/lib/validation/schemas";

const revalidateLeave = () => {
  revalidatePath("/manager/leave");
  revalidatePath("/hq/leave", "layout");
};

/** 院長・本部による代理申請（端末を使えないスタッフの分など） */
export async function proxyRequestLeave(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(leaveRequestSchema, formData);
  if (!parsed.ok) return parsed;
  const d = parsed.data;
  await requireClinicManager(d.clinic_id);
  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("request_leave", {
    p_staff_id: d.staff_id,
    p_type: d.leave_type,
    p_start: d.start_date,
    p_end: d.end_date ?? d.start_date,
    p_unit: d.unit,
    p_minutes: null,
    p_note: d.note,
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidateLeave();
  return { ok: true, message: "休暇を申請しました（院長の一次承認 → 本部の最終承認で確定します）" };
}

/** 院長の一次承認・本部の最終承認・却下・取消 */
export async function decideLeave(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(leaveDecisionSchema, formData);
  if (!parsed.ok) return parsed;
  const { leave_request_id: id, decision, comment } = parsed.data;
  if (decision === "final_approve") await requireHq();
  else await requireManager();
  const supabase = await createSupabaseServer();

  const call =
    decision === "manager_approve"
      ? supabase.rpc("approve_leave_manager", { p_request_id: id, p_comment: comment || null })
      : decision === "final_approve"
        ? supabase.rpc("approve_leave_final", { p_request_id: id, p_comment: comment || null })
        : decision === "reject"
          ? supabase.rpc("reject_leave", { p_request_id: id, p_reason: comment ?? "" })
          : supabase.rpc("cancel_leave", { p_request_id: id, p_reason: comment ?? "" });
  const { error } = await call;
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidateLeave();
  const messages = {
    manager_approve: "一次承認しました（本部の最終承認待ち）",
    final_approve: "最終承認しました（台帳から差し引き、シフトに反映しました）",
    reject: "却下しました",
    cancel: "取り消しました",
  };
  return { ok: true, message: messages[decision] };
}
