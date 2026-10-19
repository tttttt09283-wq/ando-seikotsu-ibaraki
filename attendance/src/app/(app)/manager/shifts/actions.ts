"use server";

import { revalidatePath } from "next/cache";
import { requireClinicManager } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { toUserMessage, type ActionResult } from "@/lib/errors";
import { hhmm } from "@/lib/calendar";
import { previousMonthMapping } from "@/lib/shifts/copy";
import { toShiftView, type ShiftRow } from "@/lib/shifts/model";
import { isActiveOn, type AssignmentRow } from "@/lib/data/types";
import { addMonths, monthDates } from "@/lib/time/jst";
import {
  parseForm,
  shiftEditSchema,
  shiftMonthActionSchema,
  shiftTemplateSchema,
  shiftTemplateToggleSchema,
  type ShiftEditInput,
} from "@/lib/validation/schemas";

const SHIFTS_PATH = "/manager/shifts";

function revalidateShiftPages() {
  revalidatePath(SHIFTS_PATH, "layout");
}

/**
 * 選択した欄（スタッフ×日付）に一括でシフトを入れる・変更する・取り消す。
 * 権限・所属・確定後の理由必須・楽観ロック・締め済みの判定はすべて DB の RPC で行う。
 */
export async function applyShiftEdit(input: ShiftEditInput): Promise<ActionResult> {
  const parsed = shiftEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  const d = parsed.data;
  await requireClinicManager(d.clinic_id);
  const supabase = await createSupabaseServer();
  const reason = d.reason ? d.reason : null;

  if (d.mode === "cancel") {
    const items = d.cells.flatMap((c) => c.shifts.map((s) => ({ shift_id: s.shift_id, expected_version: s.version })));
    if (items.length === 0) return { ok: false, message: "取り消すシフトがありません" };
    const { data, error } = await supabase.rpc("cancel_shifts", { p_items: items, p_reason: reason });
    if (error) return { ok: false, message: toUserMessage(error) };
    revalidateShiftPages();
    return { ok: true, message: `${data as number}件のシフトを取り消しました` };
  }

  let spec: { shift_type: string; start?: string; end?: string; break_minutes: number; template_id: string | null };
  if (d.mode === "template") {
    const { data: template } = await supabase
      .from("shift_templates")
      .select("template_id, start_time, end_time, break_minutes, is_active")
      .eq("template_id", d.template_id as string)
      .maybeSingle();
    if (!template || !template.is_active) return { ok: false, message: "勤務パターンが見つかりません" };
    spec = {
      shift_type: "work",
      start: hhmm(template.start_time as string),
      end: hhmm(template.end_time as string),
      break_minutes: template.break_minutes as number,
      template_id: template.template_id as string,
    };
  } else if (d.mode === "custom") {
    spec = { shift_type: "work", start: d.start, end: d.end, break_minutes: d.break_minutes ?? 0, template_id: null };
  } else {
    spec = { shift_type: "scheduled_holiday", break_minutes: 0, template_id: null };
  }

  const items = d.cells.map((cell) => {
    // 既存のシフトがあれば1件目を変更（午前・午後の院またぎなどで複数ある場合、2件目以降はそのまま）
    const existing = cell.shifts[0];
    return existing
      ? { shift_id: existing.shift_id, expected_version: existing.version, ...spec }
      : { staff_id: cell.staff_id, clinic_id: d.clinic_id, work_date: cell.date, ...spec };
  });

  const { data, error } = await supabase.rpc("save_shifts", { p_items: items, p_reason: reason });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidateShiftPages();
  return { ok: true, message: `${data as number}件のシフトを保存しました（下書きは「確定」するまでスタッフに公開されません）` };
}

export async function confirmMonth(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(shiftMonthActionSchema, formData);
  if (!parsed.ok) return parsed;
  await requireClinicManager(parsed.data.clinic_id);
  const dates = monthDates(parsed.data.month);

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("confirm_shifts", {
    p_clinic_id: parsed.data.clinic_id,
    p_from: dates[0],
    p_to: dates[dates.length - 1],
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidateShiftPages();
  return (data as number) === 0
    ? { ok: true, message: "確定する下書きはありません" }
    : { ok: true, message: `${data as number}件のシフトを確定しました` };
}

/**
 * 前月コピー：前月の同じ「第n○曜日」の勤務・休みを、下書きとしてコピーする。
 * すでにシフトがある日、その日に所属・応援登録が無いスタッフはスキップする。
 */
export async function copyPreviousMonth(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(shiftMonthActionSchema, formData);
  if (!parsed.ok) return parsed;
  const { clinic_id: clinicId, month } = parsed.data;
  await requireClinicManager(clinicId);

  const prevDates = monthDates(addMonths(month, -1));
  const targetDates = monthDates(month);
  const supabase = await createSupabaseServer();
  const [{ data: prevData }, { data: targetData }, { data: assignmentData }] = await Promise.all([
    supabase
      .from("shifts")
      .select("*")
      .eq("clinic_id", clinicId)
      .gte("work_date", prevDates[0])
      .lte("work_date", prevDates[prevDates.length - 1])
      .neq("status", "cancelled")
      .in("shift_type", ["work", "scheduled_holiday"]),
    supabase
      .from("shifts")
      .select("staff_id, work_date")
      .eq("clinic_id", clinicId)
      .gte("work_date", targetDates[0])
      .lte("work_date", targetDates[targetDates.length - 1])
      .neq("status", "cancelled"),
    supabase.from("staff_clinic_assignments").select("*").eq("clinic_id", clinicId),
  ]);

  const source = ((prevData ?? []) as ShiftRow[]).map(toShiftView);
  if (source.length === 0) return { ok: false, message: "前月のシフトがありません" };
  const occupied = new Set(((targetData ?? []) as { staff_id: string; work_date: string }[]).map((s) => `${s.staff_id}|${s.work_date}`));
  const assignments = (assignmentData ?? []) as AssignmentRow[];

  let skipped = 0;
  const items = previousMonthMapping(month).flatMap(({ target, source: sourceDate }) =>
    source
      .filter((s) => s.workDate === sourceDate)
      .flatMap((s) => {
        const assigned = assignments.some((a) => a.staff_id === s.staffId && isActiveOn(a, target));
        if (!assigned || occupied.has(`${s.staffId}|${target}`)) {
          skipped++;
          return [];
        }
        return [
          {
            staff_id: s.staffId,
            clinic_id: clinicId,
            work_date: target,
            shift_type: s.type,
            start: s.start,
            end: s.end,
            break_minutes: s.breakMinutes,
            template_id: s.templateId,
          },
        ];
      }),
  );
  if (items.length === 0) return { ok: true, message: `コピーできるシフトはありませんでした（スキップ ${skipped}件）` };

  const { data, error } = await supabase.rpc("save_shifts", { p_items: items, p_reason: "前月コピー" });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidateShiftPages();
  return {
    ok: true,
    message: `前月から${data as number}件を下書きでコピーしました${skipped ? `（既存シフト・所属なしのため${skipped}件スキップ）` : ""}。祝日・休診日の警告を確認してください`,
  };
}

export async function saveTemplate(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(shiftTemplateSchema, formData);
  if (!parsed.ok) return parsed;
  const { template_id: templateId, ...values } = parsed.data;
  const actor = await requireClinicManager(values.clinic_id);
  if (values.start_time === values.end_time) return { ok: false, message: "開始と終了が同じです" };

  const supabase = await createSupabaseServer();
  const { error } = templateId
    ? await supabase.from("shift_templates").update(values).eq("template_id", templateId).eq("clinic_id", values.clinic_id)
    : await supabase.from("shift_templates").insert({ ...values, created_by: actor.userId });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidateShiftPages();
  return { ok: true, message: `勤務パターン「${values.name}」を保存しました` };
}

export async function toggleTemplate(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(shiftTemplateToggleSchema, formData);
  if (!parsed.ok) return parsed;
  await requireClinicManager(parsed.data.clinic_id);

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("shift_templates")
    .update({ is_active: parsed.data.is_active })
    .eq("template_id", parsed.data.template_id)
    .eq("clinic_id", parsed.data.clinic_id)
    .select("template_id");
  if (error) return { ok: false, message: toUserMessage(error) };
  if (!data?.length) return { ok: false, message: "この勤務パターンは変更できません（全院共通パターンは本部が管理します）" };
  revalidateShiftPages();
  return { ok: true, message: parsed.data.is_active ? "使用を再開しました" : "使用を停止しました" };
}
