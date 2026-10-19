"use server";

import { revalidatePath } from "next/cache";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { toUserMessage, type ActionResult } from "@/lib/errors";
import { kioskDisableSchema, kioskIssueSchema, parseForm } from "@/lib/validation/schemas";

/** 登録コードを発行する。コードはこの画面に1回だけ表示し、DB にはハッシュのみ保存する */
export async function issueRegistration(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireHq();
  const parsed = parseForm(kioskIssueSchema, formData);
  if (!parsed.ok) return parsed;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("issue_kiosk_registration", {
    p_clinic_id: parsed.data.clinic_id,
    p_name: parsed.data.name,
    p_device_id: parsed.data.device_id,
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  const code = (data as { code: string }).code;
  revalidatePath("/admin/kiosks");
  return {
    ok: true,
    message: `登録コード：${code.slice(0, 4)}-${code.slice(4)}（24時間有効・この画面でのみ表示）。端末で /kiosk を開いて入力してください`,
  };
}

export async function disableDevice(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireHq();
  const parsed = parseForm(kioskDisableSchema, formData);
  if (!parsed.ok) return parsed;
  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("disable_kiosk_device", { p_device_id: parsed.data.device_id });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath("/admin/kiosks");
  return { ok: true, message: "端末を停止しました（この端末では打刻できなくなります）" };
}
