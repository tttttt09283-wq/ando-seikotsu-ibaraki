"use server";

import { revalidatePath } from "next/cache";
import { requireClinicManager, requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { toUserMessage, type ActionResult } from "@/lib/errors";
import { addMonths, monthDates } from "@/lib/time/jst";
import {
  holidayCreditDecisionSchema,
  holidayCreditExpirationSchema,
  parseForm,
  shiftMonthActionSchema,
} from "@/lib/validation/schemas";

const PATH = "/manager/holiday-credits";

/** 付与候補の生成（その月と前月の祝日勤務。院長確認済みの勤怠が対象） */
export async function generateCandidates(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(shiftMonthActionSchema, formData);
  if (!parsed.ok) return parsed;
  await requireClinicManager(parsed.data.clinic_id);
  const supabase = await createSupabaseServer();
  const from = monthDates(addMonths(parsed.data.month, -1))[0];
  const to = monthDates(parsed.data.month).at(-1) as string;
  const { data, error } = await supabase.rpc("generate_holiday_credit_candidates", {
    p_clinic_id: parsed.data.clinic_id,
    p_from: from,
    p_to: to,
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath(PATH);
  return { ok: true, message: (data as number) > 0 ? `${data as number}件の付与候補を追加しました` : "新しい付与候補はありませんでした" };
}

/** 報告（院長）・承認／却下・取消（本部） */
export async function decideHolidayCredit(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(holidayCreditDecisionSchema, formData);
  if (!parsed.ok) return parsed;
  const { request_id: id, clinic_id: clinicId, decision, comment } = parsed.data;
  if (decision === "approve" || decision === "revoke") await requireHq();
  else await requireClinicManager(clinicId);
  const supabase = await createSupabaseServer();
  const call =
    decision === "submit"
      ? supabase.rpc("submit_holiday_credit", { p_request_id: id, p_reason: comment ?? "" })
      : decision === "approve"
        ? supabase.rpc("approve_holiday_credit", { p_request_id: id, p_comment: comment || null })
        : decision === "reject"
          ? supabase.rpc("reject_holiday_credit", { p_request_id: id, p_reason: comment ?? "" })
          : supabase.rpc("revoke_holiday_credit", { p_request_id: id, p_reason: comment ?? "" });
  const { error } = await call;
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath(PATH);
  const messages = {
    submit: "本部に報告しました（本部の承認で振休が1日付与されます）",
    approve: "承認しました（振休を1日付与しました）",
    reject: "却下しました",
    revoke: "付与を取り消しました（履歴は残ります）",
  };
  return { ok: true, message: messages[decision] };
}

export async function changeExpiration(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireHq();
  const parsed = parseForm(holidayCreditExpirationSchema, formData);
  if (!parsed.ok) return parsed;
  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("set_holiday_credit_expiration", {
    p_holiday_credit_id: parsed.data.holiday_credit_id,
    p_expiration_date: parsed.data.expiration_date,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath(PATH);
  return { ok: true, message: `期限を ${parsed.data.expiration_date} に変更しました` };
}

export async function expireCredits(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireHq();
  const ids = formData.getAll("holiday_credit_id").map(String).filter(Boolean);
  if (ids.length === 0) return { ok: false, message: "失効させる振休を選択してください" };
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("expire_holiday_credits", { p_as_of: null, p_ids: ids });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath(PATH);
  return { ok: true, message: `${Number(data)}日分を失効として記録しました` };
}
