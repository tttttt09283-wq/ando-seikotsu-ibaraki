"use server";

import { revalidatePath } from "next/cache";
import { requireClinicManager, requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { toUserMessage, type ActionResult } from "@/lib/errors";
import { addDays, jstDateTimeToUtc } from "@/lib/time/jst";
import { adjustmentDecisionSchema, adjustmentRequestSchema, attendanceRangeSchema, parseForm } from "@/lib/validation/schemas";

const revalidateAttendance = () => revalidatePath("/manager/attendance", "layout");

/** 勤怠の再計算（打刻原本・確定シフト・勤務条件から DB 内で計算し直す） */
export async function recalcAttendance(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(attendanceRangeSchema, formData);
  if (!parsed.ok) return parsed;
  await requireClinicManager(parsed.data.clinic_id);
  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("recalc_attendance", {
    p_clinic_id: parsed.data.clinic_id,
    p_from: parsed.data.from,
    p_to: parsed.data.to,
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidateAttendance();
  return { ok: true, message: "再計算しました" };
}

/** 院長確認（打刻漏れ・再計算待ちの日は確認できない） */
export async function confirmAttendance(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(attendanceRangeSchema, formData);
  if (!parsed.ok) return parsed;
  await requireClinicManager(parsed.data.clinic_id);
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("confirm_attendance", {
    p_clinic_id: parsed.data.clinic_id,
    p_from: parsed.data.from,
    p_to: parsed.data.to,
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  const r = data as { confirmed: number; skipped: number };
  // 院長確認した祝日勤務から、振休の付与候補を作る（付与対象スタッフのみ。残数にはまだ加算しない）
  await supabase.rpc("generate_holiday_credit_candidates", {
    p_clinic_id: parsed.data.clinic_id,
    p_from: parsed.data.from,
    p_to: parsed.data.to,
  });
  revalidateAttendance();
  revalidatePath("/manager/holiday-credits");
  return {
    ok: true,
    message: `${r.confirmed}件を院長確認済みにしました${r.skipped ? `（打刻漏れ・再計算待ちの${r.skipped}件は修正後に確認してください）` : ""}`,
  };
}

/** 打刻修正の申請（院長・本部）。申請者の院長確認を一次承認として、本部が最終承認する */
export async function requestAdjustment(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(adjustmentRequestSchema, formData);
  if (!parsed.ok) return parsed;
  const d = parsed.data;
  await requireClinicManager(d.clinic_id);
  const requestedTime =
    d.change_type === "void" ? null : jstDateTimeToUtc(d.next_day ? addDays(d.work_date, 1) : d.work_date, d.time as string).toISOString();

  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("request_attendance_adjustment", {
    p_staff_id: d.staff_id,
    p_work_date: d.work_date,
    p_clinic_id: d.clinic_id,
    p_change_type: d.change_type,
    p_target_event_id: d.target_event_id,
    p_punch_type: d.punch_type || null,
    p_requested_time: requestedTime,
    p_reason: d.reason,
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidateAttendance();
  return { ok: true, message: "打刻修正を申請しました（本部の承認後に反映されます）" };
}

/** 打刻修正の承認・却下。承認は本部のみ。院長は自院の申請を取り下げられる */
export async function decideAdjustment(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(adjustmentDecisionSchema, formData);
  if (!parsed.ok) return parsed;
  const supabase = await createSupabaseServer();
  if (parsed.data.decision === "approve") {
    await requireHq();
    const { error } = await supabase.rpc("approve_attendance_adjustment", {
      p_request_id: parsed.data.request_id,
      p_comment: parsed.data.comment || null,
    });
    if (error) return { ok: false, message: toUserMessage(error) };
    revalidateAttendance();
    return { ok: true, message: "承認しました（打刻原本に追記し、勤怠を再計算しました）" };
  }
  if (!parsed.data.comment) return { ok: false, message: "却下・取り下げの理由を入力してください" };
  const { error } = await supabase.rpc("reject_attendance_adjustment", {
    p_request_id: parsed.data.request_id,
    p_reason: parsed.data.comment,
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidateAttendance();
  return { ok: true, message: "処理しました" };
}
