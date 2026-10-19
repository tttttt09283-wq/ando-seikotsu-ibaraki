"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { toUserMessage, type ActionResult } from "@/lib/errors";
import {
  contractSchema,
  endAssignmentSchema,
  parseForm,
  staffCreateSchema,
  staffTransferSchema,
  staffUpdateSchema,
  supportAssignmentSchema,
} from "@/lib/validation/schemas";

function privatePayload(d: {
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  postal_code: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
}) {
  return {
    birth_date: d.birth_date,
    phone: d.phone,
    email: d.email,
    postal_code: d.postal_code,
    address: d.address,
    emergency_contact_name: d.emergency_contact_name,
    emergency_contact_phone: d.emergency_contact_phone,
    notes: d.notes,
  };
}

export async function createStaff(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireHq();
  const parsed = parseForm(staffCreateSchema, formData);
  if (!parsed.ok) return parsed;
  const d = parsed.data;

  const supabase = await createSupabaseServer();
  const { data: staffId, error } = await supabase.rpc("create_staff", {
    p_staff_code: d.staff_code,
    p_family_name: d.family_name,
    p_given_name: d.given_name,
    p_family_name_kana: d.family_name_kana,
    p_given_name_kana: d.given_name_kana,
    p_hire_date: d.hire_date,
    p_primary_clinic_id: d.primary_clinic_id,
    p_private: privatePayload(d),
  });
  if (error) return { ok: false, message: toUserMessage(error) };

  revalidatePath("/admin/staff");
  redirect(`/admin/staff/${staffId as string}?created=1`);
}

export async function updateStaff(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireHq();
  const parsed = parseForm(staffUpdateSchema, formData);
  if (!parsed.ok) return parsed;
  const d = parsed.data;

  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("update_staff", {
    p_staff_id: d.staff_id,
    p_profile: {
      family_name: d.family_name,
      given_name: d.given_name,
      family_name_kana: d.family_name_kana,
      given_name_kana: d.given_name_kana,
      hire_date: d.hire_date,
      retire_date: d.retire_date,
      status: d.status,
    },
    p_private: privatePayload(d),
  });
  if (error) return { ok: false, message: toUserMessage(error) };

  revalidatePath(`/admin/staff/${d.staff_id}`);
  revalidatePath("/admin/staff");
  return { ok: true, message: "スタッフ情報を保存しました" };
}

export async function transferStaff(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireHq();
  const parsed = parseForm(staffTransferSchema, formData);
  if (!parsed.ok) return parsed;
  const d = parsed.data;

  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("transfer_staff", {
    p_staff_id: d.staff_id,
    p_new_clinic_id: d.new_clinic_id,
    p_effective_date: d.effective_date,
    p_note: d.note,
  });
  if (error) return { ok: false, message: toUserMessage(error) };

  revalidatePath(`/admin/staff/${d.staff_id}`);
  revalidatePath("/admin/staff");
  return { ok: true, message: `${d.effective_date} 付で異動を登録しました` };
}

export async function addSupportAssignment(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await requireHq();
  const parsed = parseForm(supportAssignmentSchema, formData);
  if (!parsed.ok) return parsed;
  const d = parsed.data;

  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("staff_clinic_assignments").insert({
    staff_id: d.staff_id,
    clinic_id: d.clinic_id,
    assignment_type: "support",
    valid_from: d.valid_from,
    valid_to: d.valid_to,
    note: d.note,
    created_by: actor.userId,
  });
  if (error) return { ok: false, message: toUserMessage(error) };

  revalidatePath(`/admin/staff/${d.staff_id}`);
  return { ok: true, message: "応援勤務先を登録しました" };
}

export async function endAssignment(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireHq();
  const parsed = parseForm(endAssignmentSchema, formData);
  if (!parsed.ok) return parsed;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("staff_clinic_assignments")
    .update({ valid_to: parsed.data.valid_to })
    .eq("assignment_id", parsed.data.assignment_id)
    .eq("assignment_type", "support")
    .select("staff_id");
  if (error) return { ok: false, message: toUserMessage(error) };
  if (!data?.length) return { ok: false, message: "対象の応援登録が見つかりません" };

  revalidatePath(`/admin/staff/${data[0].staff_id as string}`);
  return { ok: true, message: "応援登録の終了日を設定しました" };
}

export async function saveContract(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireHq();
  const parsed = parseForm(contractSchema, formData);
  if (!parsed.ok) return parsed;
  const d = parsed.data;

  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("set_employment_contract", {
    p_staff_id: d.staff_id,
    p_valid_from: d.valid_from,
    p_employment_type: d.employment_type,
    p_weekly_scheduled_days: d.weekly_scheduled_days,
    p_weekly_scheduled_minutes: d.weekly_scheduled_minutes,
    p_daily_scheduled_minutes: d.daily_scheduled_minutes,
    p_fixed_overtime_minutes: d.fixed_overtime_minutes,
    p_legal_weekly_limit_minutes: d.legal_weekly_limit_minutes,
    p_reason: d.reason,
  });
  if (error) return { ok: false, message: toUserMessage(error) };

  revalidatePath(`/admin/staff/${d.staff_id}`);
  return { ok: true, message: `${d.valid_from} から適用する勤務条件を保存しました` };
}
