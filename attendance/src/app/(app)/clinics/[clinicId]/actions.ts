"use server";

import { revalidatePath } from "next/cache";
import { requireClinicManager, requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { toUserMessage, type ActionResult } from "@/lib/errors";
import { normalizeDaySlots, parseWeeklyHours } from "@/lib/calendar";
import {
  businessHoursMetaSchema,
  calendarExceptionDeleteSchema,
  calendarExceptionSchema,
  parseForm,
} from "@/lib/validation/schemas";

export async function saveBusinessHours(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireHq();
  const meta = parseForm(businessHoursMetaSchema, formData);
  if (!meta.ok) return meta;
  const weekly = parseWeeklyHours(formData);
  if (!weekly.ok) return weekly;

  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("set_clinic_business_hours", {
    p_clinic_id: meta.data.clinic_id,
    p_valid_from: meta.data.valid_from,
    p_slots: weekly.slots,
  });
  if (error) return { ok: false, message: toUserMessage(error) };

  revalidatePath(`/clinics/${meta.data.clinic_id}`);
  return { ok: true, message: `${meta.data.valid_from} から適用する診療時間を登録しました` };
}

export async function saveCalendarException(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(calendarExceptionSchema, formData);
  if (!parsed.ok) return parsed;
  const actor = await requireClinicManager(parsed.data.clinic_id);

  let slots: { open: string; close: string }[] = [];
  if (!parsed.data.is_closed) {
    const normalized = normalizeDaySlots(
      [1, 2].map((n) => ({
        open: String(formData.get(`open${n}`) ?? ""),
        close: String(formData.get(`close${n}`) ?? ""),
      })),
      "特別診療",
    );
    if (!normalized.ok) return normalized;
    if (normalized.slots.length === 0) return { ok: false, message: "特別診療の場合は診療時間を入力してください" };
    slots = normalized.slots;
  }

  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("clinic_calendar_exceptions").upsert(
    {
      clinic_id: parsed.data.clinic_id,
      target_date: parsed.data.target_date,
      is_closed: parsed.data.is_closed,
      slots,
      reason: parsed.data.reason,
      created_by: actor.userId,
    },
    { onConflict: "clinic_id,target_date" },
  );
  if (error) return { ok: false, message: toUserMessage(error) };

  revalidatePath(`/clinics/${parsed.data.clinic_id}`);
  return {
    ok: true,
    message: `${parsed.data.target_date} を${parsed.data.is_closed ? "臨時休診" : "特別診療日"}として登録しました`,
  };
}

export async function deleteCalendarException(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(calendarExceptionDeleteSchema, formData);
  if (!parsed.ok) return parsed;
  await requireClinicManager(parsed.data.clinic_id);

  // DB 側でも RLS（本部または担当院の院長のみ削除可）で判定する。削除できた行が無ければ拒否扱い
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("clinic_calendar_exceptions")
    .delete()
    .eq("id", parsed.data.exception_id)
    .eq("clinic_id", parsed.data.clinic_id)
    .select("id");
  if (error) return { ok: false, message: toUserMessage(error) };
  if (!data?.length) return { ok: false, message: "対象が見つからないか、取り消す権限がありません" };

  revalidatePath(`/clinics/${parsed.data.clinic_id}`);
  return { ok: true, message: "取り消しました（通常の診療時間に戻ります）" };
}

