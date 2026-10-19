import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isHq, managedClinicIds, type Actor } from "@/lib/auth/permissions";
import { isActiveOn, staffName, type AssignmentRow, type ClinicRow, type StaffRow } from "@/lib/data/types";
import { hhmm } from "@/lib/calendar";
import { addMonths, isValidMonth, monthDates, todayJst, weekdayOf } from "@/lib/time/jst";
import { toShiftView, type ShiftRow, type ShiftView } from "./model";
import type { ClinicDay } from "./warnings";

export interface ShiftTemplate {
  template_id: string;
  clinic_id: string | null;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  color: string;
  is_active: boolean;
  display_order: number;
}

export interface MonthStaff {
  staffId: string;
  code: string;
  name: string;
  /** その月にこの院へ主所属している日があるか */
  primary: boolean;
  /** その日にこの院へ所属（主所属・応援）しているか */
  assignedDates: Set<string>;
  primaryDates: Set<string>;
}

export interface ShiftMonth {
  clinic: Pick<ClinicRow, "clinic_id" | "name" | "status">;
  clinics: Pick<ClinicRow, "clinic_id" | "name">[];
  month: string;
  dates: string[];
  days: (ClinicDay & { weekday: number })[];
  staff: MonthStaff[];
  shifts: ShiftView[];
  templates: ShiftTemplate[];
  closed: boolean;
}

/** 院長は担当院、本部は全院から選べる */
export async function selectableClinics(supabase: SupabaseClient, actor: Actor) {
  const query = supabase.from("clinics").select("clinic_id, name, status").neq("status", "closed").order("display_order");
  const { data } = isHq(actor) ? await query : await query.in("clinic_id", managedClinicIds(actor));
  return (data ?? []) as Pick<ClinicRow, "clinic_id" | "name" | "status">[];
}

/** URL の院・年月を検証し、既定値（最初の担当院・翌月）を補う */
export function resolveSelection(
  clinics: { clinic_id: string }[],
  params: { clinic?: string; month?: string },
): { clinicId: string | null; month: string } {
  const clinicId = clinics.find((c) => c.clinic_id === params.clinic)?.clinic_id ?? clinics[0]?.clinic_id ?? null;
  const month = params.month && isValidMonth(params.month) ? params.month : addMonths(todayJst().slice(0, 7), 1);
  return { clinicId, month };
}

export async function loadShiftMonth(supabase: SupabaseClient, actor: Actor, clinicId: string, month: string): Promise<ShiftMonth | null> {
  const clinics = await selectableClinics(supabase, actor);
  const clinic = clinics.find((c) => c.clinic_id === clinicId);
  if (!clinic) return null;

  const dates = monthDates(month);
  const from = dates[0];
  const to = dates[dates.length - 1];

  const [{ data: assignmentData }, { data: shiftData }, { data: hoursData }, { data: holidayData }, { data: templateData }, { data: closing }] =
    await Promise.all([
      supabase.from("staff_clinic_assignments").select("*").eq("clinic_id", clinicId),
      supabase
        .from("shifts")
        .select("*")
        .eq("clinic_id", clinicId)
        .gte("work_date", from)
        .lte("work_date", to)
        .neq("status", "cancelled")
        .order("scheduled_start", { nullsFirst: true }),
      supabase.rpc("clinic_hours_between", { p_clinic_id: clinicId, p_from: from, p_to: to }),
      supabase.from("company_holidays").select("holiday_date, name").gte("holiday_date", from).lte("holiday_date", to),
      supabase
        .from("shift_templates")
        .select("*")
        .or(`clinic_id.is.null,clinic_id.eq.${clinicId}`)
        .order("display_order")
        .order("name"),
      supabase.from("monthly_closings").select("status").eq("clinic_id", clinicId).eq("year_month", from).maybeSingle(),
    ]);

  const assignments = ((assignmentData ?? []) as AssignmentRow[]).filter((a) => a.valid_from <= to && (a.valid_to === null || a.valid_to >= from));
  const staffIds = [...new Set(assignments.map((a) => a.staff_id))];
  const { data: staffData } = staffIds.length
    ? await supabase.from("staff_profiles").select("staff_id, staff_code, family_name, given_name").in("staff_id", staffIds)
    : { data: [] };
  const profiles = new Map(((staffData ?? []) as StaffRow[]).map((s) => [s.staff_id, s]));

  const staff: MonthStaff[] = staffIds
    .filter((id) => profiles.has(id))
    .map((id) => {
      const mine = assignments.filter((a) => a.staff_id === id);
      const assignedDates = new Set(dates.filter((d) => mine.some((a) => isActiveOn(a, d))));
      const primaryDates = new Set(dates.filter((d) => mine.some((a) => a.assignment_type === "primary" && isActiveOn(a, d))));
      const p = profiles.get(id) as StaffRow;
      return { staffId: id, code: p.staff_code, name: staffName(p), primary: primaryDates.size > 0, assignedDates, primaryDates };
    })
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.code.localeCompare(b.code));

  const hours = (hoursData ?? []) as { target_date: string; open_time: string; close_time: string }[];
  const holidayName = new Map(((holidayData ?? []) as { holiday_date: string; name: string }[]).map((h) => [h.holiday_date, h.name]));
  const days = dates.map((date) => ({
    date,
    weekday: weekdayOf(date),
    slots: hours.filter((h) => h.target_date === date).map((h) => ({ open: hhmm(h.open_time), close: hhmm(h.close_time) })),
    holidayName: holidayName.get(date) ?? null,
  }));

  return {
    clinic,
    clinics,
    month,
    dates,
    days,
    staff,
    shifts: ((shiftData ?? []) as ShiftRow[]).map(toShiftView),
    templates: (templateData ?? []) as ShiftTemplate[],
    closed: (closing as { status: string } | null)?.status === "closed",
  };
}
