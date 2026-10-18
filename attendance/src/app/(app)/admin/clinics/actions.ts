"use server";

import { revalidatePath } from "next/cache";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { toUserMessage, type ActionResult } from "@/lib/errors";
import { clinicCreateSchema, clinicRenameSchema, clinicStatusSchema, parseForm } from "@/lib/validation/schemas";

export async function createClinic(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireHq();
  const parsed = parseForm(clinicCreateSchema, formData);
  if (!parsed.ok) return parsed;

  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("clinics").insert(parsed.data);
  if (error) return { ok: false, message: toUserMessage(error) };

  revalidatePath("/admin/clinics");
  return { ok: true, message: `${parsed.data.name} を追加しました` };
}

export async function renameClinic(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireHq();
  const parsed = parseForm(clinicRenameSchema, formData);
  if (!parsed.ok) return parsed;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("clinics")
    .update({ name: parsed.data.name })
    .eq("clinic_id", parsed.data.clinic_id)
    .select("clinic_id");
  if (error) return { ok: false, message: toUserMessage(error) };
  if (!data?.length) return { ok: false, message: "店舗が見つからないか、変更する権限がありません" };

  revalidatePath("/admin/clinics");
  return { ok: true, message: "院名を変更しました（過去の勤怠は同じ店舗IDで引き継がれます）" };
}

export async function changeClinicStatus(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireHq();
  const parsed = parseForm(clinicStatusSchema, formData);
  if (!parsed.ok) return parsed;

  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("set_clinic_status", {
    p_clinic_id: parsed.data.clinic_id,
    p_status: parsed.data.status,
    p_effective_date: parsed.data.effective_date,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, message: toUserMessage(error) };

  revalidatePath("/admin/clinics");
  return { ok: true, message: "店舗の状態を変更しました" };
}
