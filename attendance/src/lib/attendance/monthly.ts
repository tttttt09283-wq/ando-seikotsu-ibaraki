import { fixedOvertimeExcess } from "./labels";

/** 月次集計に使う attendance_daily の列 */
export interface MonthlyDailyRow {
  staff_id: string;
  work_date: string;
  worked_minutes: number;
  overtime_statutory_minutes: number;
  overtime_non_statutory_minutes: number;
  late_night_minutes: number;
  legal_holiday_minutes: number;
  scheduled_holiday_minutes: number;
  late_minutes: number;
  early_leave_minutes: number;
  is_absent: boolean;
  has_missing_punch: boolean;
  needs_recalc: boolean;
  status: string;
}

/** 1人1か月の集計。みなし残業は月末時点の勤務条件の値を渡す（勤務条件が無ければ null） */
export function summarizeMonth(rows: MonthlyDailyRow[], fixedOvertimeMinutes: number | null, today: string) {
  const sum = (k: keyof MonthlyDailyRow) => rows.reduce((acc, r) => acc + (r[k] as number), 0);
  const statutory = sum("overtime_statutory_minutes");
  const fixed = fixedOvertimeMinutes ?? 0;
  return {
    days: rows.filter((r) => r.worked_minutes > 0).length,
    worked: sum("worked_minutes"),
    statutory,
    nonStatutory: sum("overtime_non_statutory_minutes"),
    fixed,
    excess: fixedOvertimeExcess(statutory, fixed),
    night: sum("late_night_minutes"),
    legal: sum("legal_holiday_minutes"),
    scheduledHoliday: sum("scheduled_holiday_minutes"),
    lateCount: rows.filter((r) => r.late_minutes > 0).length,
    lateMinutes: sum("late_minutes"),
    earlyCount: rows.filter((r) => r.early_leave_minutes > 0).length,
    earlyMinutes: sum("early_leave_minutes"),
    absent: rows.filter((r) => r.is_absent).length,
    missing: rows.filter((r) => r.has_missing_punch).length,
    unconfirmed: rows.filter((r) => r.status === "open" && r.work_date < today).length,
    recalc: rows.filter((r) => r.needs_recalc).length,
    hasContract: fixedOvertimeMinutes !== null,
  };
}
