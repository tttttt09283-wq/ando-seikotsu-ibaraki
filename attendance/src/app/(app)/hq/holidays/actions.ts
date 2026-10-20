"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { toUserMessage, type ActionResult } from "@/lib/errors";
import { DAY_CODES } from "@/lib/holiday/codes";
import { addDays, addMonths, weekdayOf } from "@/lib/time/jst";

const codeSchema = z.enum(DAY_CODES.map((c) => c.code) as [string, ...string[]]);
const revalidate = () => {
  revalidatePath("/hq/holidays", "layout");
  revalidatePath("/manager/attendance", "layout");
};

/** 1日の区分を登録・変更・削除（code が空なら削除） */
export async function setDayRecord(staffId: string, date: string, code: string | null): Promise<ActionResult> {
  await requireHq();
  const parsed = z
    .object({ staffId: z.uuid(), date: z.iso.date(), code: codeSchema.nullable() })
    .safeParse({ staffId, date, code: code || null });
  if (!parsed.success) return { ok: false, message: "入力が正しくありません" };
  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("set_staff_day_records", {
    p_staff_id: parsed.data.staffId,
    p_rows: [{ date: parsed.data.date, code: parsed.data.code }],
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidate();
  return { ok: true, message: `${date} を保存しました` };
}

const classifySchema = z.object({
  staff_id: z.uuid(),
  from_month: z.string().regex(/^\d{4}-\d{2}$/),
  to_month: z.string().regex(/^\d{4}-\d{2}$/),
  legal_weekday: z.coerce.number().int().min(0).max(6),
});

/**
 * 確定シフトの「休み」で区分の無い日を、法定内（指定の曜日）・法定外に一括で区分する。
 * 既に区分がある日は変更しない。
 */
export async function classifyOffDays(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireHq();
  const parsed = classifySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "入力が正しくありません" };
  const { staff_id, from_month, to_month, legal_weekday } = parsed.data;
  if (to_month < from_month || addMonths(from_month, 12) <= to_month) return { ok: false, message: "期間は12か月以内で指定してください" };
  const from = `${from_month}-01`;
  const to = addDays(`${addMonths(to_month, 1)}-01`, -1);
  const supabase = await createSupabaseServer();
  const [{ data: shiftData }, { data: recordData }] = await Promise.all([
    supabase
      .from("shifts")
      .select("work_date, shift_type")
      .eq("staff_id", staff_id)
      .gte("work_date", from)
      .lte("work_date", to)
      .in("status", ["confirmed", "revised"]),
    supabase.from("staff_day_records").select("work_date").eq("staff_id", staff_id).gte("work_date", from).lte("work_date", to),
  ]);
  const shifts = (shiftData ?? []) as { work_date: string; shift_type: string }[];
  const recorded = new Set(((recordData ?? []) as { work_date: string }[]).map((r) => r.work_date));
  const workDays = new Set(shifts.filter((s) => s.shift_type === "work").map((s) => s.work_date));
  const offDays = [
    ...new Set(shifts.filter((s) => s.shift_type === "scheduled_holiday" || s.shift_type === "legal_holiday").map((s) => s.work_date)),
  ]
    .filter((d) => !workDays.has(d) && !recorded.has(d))
    .sort();
  if (offDays.length === 0) return { ok: true, message: "区分の無い「休み」はありませんでした" };
  const rows = offDays.map((d) => ({ date: d, code: weekdayOf(d) === legal_weekday ? "legal_holiday" : "non_legal_holiday" }));
  const { error } = await supabase.rpc("set_staff_day_records", { p_staff_id: staff_id, p_rows: rows });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidate();
  const legal = rows.filter((r) => r.code === "legal_holiday").length;
  return { ok: true, message: `${rows.length}日を区分しました（法定内 ${legal}日・法定外 ${rows.length - legal}日）` };
}

const settingsSchema = z.object({
  staff_id: z.uuid(),
  grant_basis: z.enum(["hire_date", "base_date"]),
  first_base_date: z.union([z.iso.date(), z.literal("")]).optional(),
  carryover_max: z.coerce.number().min(0).max(40).default(20),
});

/** 有休の付与方式（入社日基準／基準日方式） */
export async function saveLeaveSettings(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireHq();
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "入力が正しくありません" };
  const d = parsed.data;
  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("set_staff_leave_settings", {
    p_staff_id: d.staff_id,
    p_basis: d.grant_basis,
    p_first_base_date: d.first_base_date || null,
    p_carryover_max: d.carryover_max,
    p_note: null,
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidate();
  revalidatePath("/hq/leave", "layout");
  return { ok: true, message: "有休の付与方式を保存しました" };
}
