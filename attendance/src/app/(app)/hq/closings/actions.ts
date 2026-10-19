"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClinicManager, requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { toUserMessage, type ActionResult } from "@/lib/errors";

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "対象月が正しくありません");
const clinicMonth = z.object({ clinic_id: z.uuid(), month, reason: z.string().trim().max(500).optional() });

function parse<T extends z.ZodType>(schema: T, formData: FormData): { ok: true; data: z.infer<T> } | { ok: false; message: string } {
  const r = schema.safeParse(Object.fromEntries(formData));
  return r.success ? { ok: true, data: r.data } : { ok: false, message: r.error.issues[0]?.message ?? "入力が正しくありません" };
}

const revalidateClosing = () => {
  revalidatePath("/hq", "layout");
  revalidatePath("/manager/attendance", "layout");
};

/** 院長確認（月）。未解決の事項が残る場合は理由が必要 */
export async function confirmMonth(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const p = parse(clinicMonth, formData);
  if (!p.ok) return p;
  await requireClinicManager(p.data.clinic_id);
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("manager_confirm_month", {
    p_clinic_id: p.data.clinic_id,
    p_month: `${p.data.month}-01`,
    p_reason: p.data.reason || null,
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidateClosing();
  const r = data as { confirmed_days: number };
  return { ok: true, message: `院長確認しました（${r.confirmed_days}日分を確認済みにしました）。本部の締めをお待ちください` };
}

export async function unconfirmMonth(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const p = parse(clinicMonth, formData);
  if (!p.ok) return p;
  await requireClinicManager(p.data.clinic_id);
  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("manager_unconfirm_month", {
    p_clinic_id: p.data.clinic_id,
    p_month: `${p.data.month}-01`,
    p_reason: p.data.reason || null,
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidateClosing();
  return { ok: true, message: "院長確認を取り消しました" };
}

/** 本部の締め（院別） */
export async function closeMonth(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const p = parse(clinicMonth, formData);
  if (!p.ok) return p;
  await requireHq();
  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("close_month", { p_clinic_id: p.data.clinic_id, p_month: `${p.data.month}-01` });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidateClosing();
  return { ok: true, message: "締めました" };
}

/** 全院一括の締め：締められなかった院は理由を表示する */
export async function closeAll(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const p = parse(z.object({ month }), formData);
  if (!p.ok) return p;
  await requireHq();
  const ids = formData.getAll("clinic_ids").map(String);
  if (ids.length === 0) return { ok: false, message: "締める院を選んでください" };
  if (!ids.every((id) => z.uuid().safeParse(id).success)) return { ok: false, message: "院の指定が正しくありません" };
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("close_months_bulk", { p_month: `${p.data.month}-01`, p_clinic_ids: ids });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidateClosing();
  const r = data as { closed: number; failed: { name: string; message: string }[] };
  if (r.failed.length === 0) return { ok: true, message: `${r.closed}院を締めました` };
  return {
    ok: false,
    message: `${r.closed}院を締めました。締められなかった院：${r.failed.map((f) => `${f.name}（${f.message}）`).join("、")}`,
  };
}

/** 本部の再開（理由必須） */
export async function reopenMonth(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const p = parse(clinicMonth.extend({ reason: z.string().trim().min(1, "再開の理由を入力してください").max(500) }), formData);
  if (!p.ok) return p;
  await requireHq();
  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("reopen_month", {
    p_clinic_id: p.data.clinic_id,
    p_month: `${p.data.month}-01`,
    p_reason: p.data.reason,
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidateClosing();
  return { ok: true, message: "再開しました。修正後にもう一度締めてください" };
}
