/**
 * 月の賃金計算に必要なデータを読み込み、スタッフごとに計算する（本部のみ。RLS で本部以外は読めない）。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/data/fetch-all";
import { isActiveOn, staffName, type AssignmentRow, type ContractRow, type StaffRow } from "@/lib/data/types";
import { addDays, addMonths, todayJst } from "@/lib/time/jst";
import { calcPayroll, EMPTY_INPUT, wageForMonth, type PayrollInput, type PayrollResult, type WageSetting } from "./calc";

export interface WageRow extends WageSetting {
  id: string;
  staff_id: string;
  valid_from: string;
  note: string | null;
}

export interface PayrollRow {
  staff: StaffRow;
  staffName: string;
  clinicId: string | null;
  wage: WageRow | null;
  input: PayrollInput & { note: string | null };
  workDays: number;
  holidayDays: number;
  paidLeaveDays: number;
  paidBalance: number;
  specialDays: number;
  absentDays: number;
  monthClosed: boolean;
  result: PayrollResult | null;
}

interface DailyLite {
  staff_id: string;
  home_clinic_id: string | null;
  worked_minutes: number;
  late_night_minutes: number;
  scheduled_holiday_minutes: number;
  legal_holiday_minutes: number;
  overtime_statutory_minutes: number;
  is_absent: boolean;
}

const HOLIDAY_CODES = new Set(["legal_holiday", "non_legal_holiday"]);

export async function loadPayrollMonth(supabase: SupabaseClient, month: string): Promise<PayrollRow[]> {
  const from = `${month}-01`;
  const to = addDays(`${addMonths(month, 1)}-01`, -1);
  const today = todayJst();
  const balanceOn = to < today ? to : today;

  const [staff, assignments, wages, contracts, daily, ledger, records, inputs, { data: balanceData }, { data: closingData }] = await Promise.all([
    fetchAll<StaffRow>((f, t) => supabase.from("staff_profiles").select("*").order("staff_code").range(f, t)),
    fetchAll<AssignmentRow>((f, t) => supabase.from("staff_clinic_assignments").select("*").eq("assignment_type", "primary").range(f, t)),
    fetchAll<WageRow>((f, t) => supabase.from("staff_wage_settings").select("*").range(f, t)),
    fetchAll<ContractRow>((f, t) => supabase.from("employment_contracts").select("*").range(f, t)),
    fetchAll<DailyLite>((f, t) =>
      supabase
        .from("attendance_daily")
        .select("staff_id, home_clinic_id, worked_minutes, late_night_minutes, scheduled_holiday_minutes, legal_holiday_minutes, overtime_statutory_minutes, is_absent")
        .gte("work_date", from)
        .lte("work_date", to)
        .range(f, t),
    ),
    fetchAll<{ staff_id: string; days: string }>((f, t) =>
      supabase.from("leave_ledger_entries").select("staff_id, days").in("entry_type", ["use", "use_reversal"]).gte("effective_date", from).lte("effective_date", to).range(f, t),
    ),
    fetchAll<{ staff_id: string; code: string }>((f, t) =>
      supabase.from("staff_day_records").select("staff_id, code").gte("work_date", from).lte("work_date", to).range(f, t),
    ),
    fetchAll<PayrollInput & { staff_id: string; note: string | null }>((f, t) => supabase.from("payroll_inputs").select("*").eq("year_month", from).range(f, t)),
    supabase.rpc("leave_balance_list", { p_on: balanceOn }),
    supabase.from("monthly_closings").select("clinic_id").eq("year_month", from).eq("status", "closed"),
  ]);
  const balances = new Map(((balanceData ?? []) as { staff_id: string; paid_balance: string }[]).map((b) => [b.staff_id, Number(b.paid_balance)]));
  const closed = new Set(((closingData ?? []) as { clinic_id: string }[]).map((c) => c.clinic_id));
  const num = (v: unknown) => Number(v ?? 0);

  return staff
    .filter((s) => wageForMonth(wages, s.staff_id, month) || daily.some((d) => d.staff_id === s.staff_id))
    .filter((s) => s.status !== "retired" || daily.some((d) => d.staff_id === s.staff_id))
    .map((s) => {
      const mine = daily.filter((d) => d.staff_id === s.staff_id);
      const sum = (k: keyof DailyLite) => mine.reduce((acc, d) => acc + num(d[k]), 0);
      const clinicId = assignments.find((a) => a.staff_id === s.staff_id && isActiveOn(a, to))?.clinic_id ?? mine[0]?.home_clinic_id ?? null;
      const contract = contracts.find((c) => c.staff_id === s.staff_id && isActiveOn(c, to));
      const wage = wageForMonth(wages, s.staff_id, month);
      const raw = inputs.find((i) => i.staff_id === s.staff_id);
      const input = raw
        ? { ...raw, side_job_days: num(raw.side_job_days), misc_allowance: raw.misc_allowance === null ? null : num(raw.misc_allowance) }
        : { ...EMPTY_INPUT, note: null };
      const paidLeaveDays = -ledger.filter((e) => e.staff_id === s.staff_id).reduce((acc, e) => acc + num(e.days), 0);
      const workDays = mine.filter((d) => d.worked_minutes > 0).length;
      const myRecords = records.filter((r) => r.staff_id === s.staff_id);
      return {
        staff: s,
        staffName: staffName(s),
        clinicId,
        wage,
        input,
        workDays,
        holidayDays: myRecords.filter((r) => HOLIDAY_CODES.has(r.code)).length + myRecords.filter((r) => r.code === "half_non_legal").length * 0.5,
        paidLeaveDays,
        paidBalance: balances.get(s.staff_id) ?? 0,
        specialDays: myRecords.filter((r) => r.code === "special_paid").length,
        absentDays: mine.filter((d) => d.is_absent).length,
        monthClosed: clinicId !== null && closed.has(clinicId),
        result: wage
          ? calcPayroll(
              {
                ...wage,
                basic_wage: wage.basic_wage === null ? null : num(wage.basic_wage),
                hourly_wage: wage.hourly_wage === null ? null : num(wage.hourly_wage),
                daily_wage: wage.daily_wage === null ? null : num(wage.daily_wage),
                monthly_hours: wage.monthly_hours === null ? null : num(wage.monthly_hours),
                overtime_threshold_hours: wage.overtime_threshold_hours === null ? null : num(wage.overtime_threshold_hours),
              },
              {
                workDays,
                workedMinutes: sum("worked_minutes"),
                lateNightMinutes: sum("late_night_minutes"),
                nonLegalHolidayMinutes: sum("scheduled_holiday_minutes"),
                legalHolidayMinutes: sum("legal_holiday_minutes"),
                statutoryOvertimeMinutes: sum("overtime_statutory_minutes"),
                paidLeaveDays,
                dailyScheduledMinutes: contract?.daily_scheduled_minutes ?? 480,
                fixedOvertimeMinutes: contract?.fixed_overtime_minutes ?? 0,
              },
              input,
            )
          : null,
      };
    });
}
