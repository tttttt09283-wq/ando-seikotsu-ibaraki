/**
 * 残業代計算（今の賃金管理表「残業代計算表」と同じ考え方）。
 *
 * 時間（月の合計を1時間単位に丸める：30分未満切り捨て・30分以上切り上げ）
 *   J 通常（実労働の合計。深夜・休日も含む） K うち深夜 L うち法定外休日 M うち法定休日 N 有休（時間換算）
 *   O 固定残業時間（勤務条件のみなし残業）
 *   P 超過残業 = J + N − 残業の基準時間 − O（マイナスは0）
 * 単価
 *   基本時給 = 月給：基礎賃金 ÷ 月の所定時間（人ごと）／時給：時給／日給：日給 ÷ 1日の所定時間
 * 割増
 *   月給：超過残業 × 基本時給 × 1.25（基準時間までは月給に含まれる）
 *   時給・日給：働いた時間は時給（日給）で払い済みのため、超過残業 × 基本時給 × 0.25
 *   深夜 = K × 基本時給 × 0.25、法定休日 = M × 基本時給 × 0.35
 *   月60時間超 = （法定時間外 − 60時間）× 基本時給 × 0.25（労働基準法37条。管理表に無い分を追加）
 * 支給総額 = 基本（月給・時給×時間・日給×日数）＋ 固定残業代 ＋ 雑手当 ＋ 割増 ＋ 交通費 ＋ 別バイト/MG代 ＋ 年末調整 − 欠勤控除
 * 金額は項目ごとに1円未満を四捨五入。
 */

export type PayType = "monthly" | "hourly" | "daily";

export interface WageSetting {
  pay_type: PayType;
  basic_wage: number | null;
  qualification_allowance: number;
  hourly_wage: number | null;
  daily_wage: number | null;
  monthly_hours: number | null;
  overtime_threshold_hours: number | null;
  fixed_overtime_allowance: number;
  commute_type: "none" | "monthly" | "per_day";
  commute_amount: number;
  misc_allowance: number;
}

export interface MonthAttendance {
  workDays: number;
  workedMinutes: number;
  lateNightMinutes: number;
  nonLegalHolidayMinutes: number;
  legalHolidayMinutes: number;
  statutoryOvertimeMinutes: number;
  paidLeaveDays: number;
  dailyScheduledMinutes: number; // 有休1日の時間換算・日給の時給換算に使う
  fixedOvertimeMinutes: number;
}

export interface PayrollInput {
  side_job_days: number;
  side_job_pay: number;
  year_end_adjustment: number;
  absence_deduction: number;
  misc_allowance: number | null;
  deduction: number;
}

export const EMPTY_INPUT: PayrollInput = {
  side_job_days: 0,
  side_job_pay: 0,
  year_end_adjustment: 0,
  absence_deduction: 0,
  misc_allowance: null,
  deduction: 0,
};

export interface PayrollResult {
  hours: { total: number; lateNight: number; nonLegalHoliday: number; legalHoliday: number; paidLeave: number; fixedOvertime: number; excessOvertime: number; statutoryOvertime: number; over60: number };
  hourlyBase: number;
  basePay: number;
  overtimePay: number;
  lateNightPay: number;
  legalHolidayPay: number;
  over60Pay: number;
  premiumTotal: number;
  fixedOvertimeAllowance: number;
  miscAllowance: number;
  commute: number;
  sideJobPay: number;
  yearEndAdjustment: number;
  absenceDeduction: number;
  gross: number;
  deduction: number;
  warnings: string[];
}

/** 月の合計（分）を1時間単位に：30分未満切り捨て・30分以上切り上げ */
export function roundMonthHours(minutes: number): number {
  const m = Math.max(0, Math.round(minutes));
  return Math.floor(m / 60) + (m % 60 >= 30 ? 1 : 0);
}

const yen = (v: number) => Math.round(v);

export function calcPayroll(w: WageSetting, a: MonthAttendance, input: PayrollInput = EMPTY_INPUT): PayrollResult {
  const warnings: string[] = [];
  const total = roundMonthHours(a.workedMinutes);
  const lateNight = roundMonthHours(a.lateNightMinutes);
  const nonLegalHoliday = roundMonthHours(a.nonLegalHolidayMinutes);
  const legalHoliday = roundMonthHours(a.legalHolidayMinutes);
  const paidLeave = roundMonthHours(a.paidLeaveDays * a.dailyScheduledMinutes);
  const fixedOvertime = a.fixedOvertimeMinutes / 60;
  const statutoryOvertime = roundMonthHours(a.statutoryOvertimeMinutes);
  const over60 = Math.max(0, statutoryOvertime - 60);
  const dailyHours = a.dailyScheduledMinutes > 0 ? a.dailyScheduledMinutes / 60 : 8;

  let hourlyBase = 0;
  let basePay = 0;
  if (w.pay_type === "monthly") {
    hourlyBase = w.basic_wage && w.monthly_hours ? w.basic_wage / w.monthly_hours : 0;
    basePay = w.basic_wage ?? 0;
  } else if (w.pay_type === "hourly") {
    hourlyBase = w.hourly_wage ?? 0;
    basePay = yen(hourlyBase * (total + paidLeave));
  } else {
    hourlyBase = (w.daily_wage ?? 0) / dailyHours;
    basePay = (w.daily_wage ?? 0) * (a.workDays + a.paidLeaveDays);
  }

  // 超過残業：基準時間（未設定なら月の所定時間）＋固定残業を超えた分。時給・日給で基準が無い場合は法定時間外
  const threshold = w.overtime_threshold_hours ?? w.monthly_hours;
  const excessOvertime =
    threshold !== null && threshold !== undefined ? Math.max(0, total + paidLeave - threshold - fixedOvertime) : Math.max(0, statutoryOvertime - fixedOvertime);
  const overtimeRate = w.pay_type === "monthly" ? 1.25 : 0.25;
  const overtimePay = yen(excessOvertime * hourlyBase * overtimeRate);
  const lateNightPay = yen(lateNight * hourlyBase * 0.25);
  const legalHolidayPay = yen(legalHoliday * hourlyBase * 0.35);
  const over60Pay = yen(over60 * hourlyBase * 0.25);
  const premiumTotal = overtimePay + lateNightPay + legalHolidayPay + over60Pay;

  const miscAllowance = input.misc_allowance ?? w.misc_allowance;
  const commute = w.commute_type === "monthly" ? w.commute_amount : w.commute_type === "per_day" ? w.commute_amount * a.workDays : 0;
  const gross =
    basePay + w.fixed_overtime_allowance + miscAllowance + premiumTotal + commute + input.side_job_pay + input.year_end_adjustment - input.absence_deduction;

  if (hourlyBase === 0) warnings.push("賃金（基礎賃金・時給・日給）が未登録です");
  if (w.pay_type === "monthly" && w.fixed_overtime_allowance > 0 && a.fixedOvertimeMinutes === 0) {
    warnings.push("固定残業代がありますが、勤務条件のみなし残業時間が0です");
  }
  if (over60 > 0) warnings.push(`法定時間外が月60時間を超えています（${over60}時間分を＋25%）`);

  return {
    hours: { total, lateNight, nonLegalHoliday, legalHoliday, paidLeave, fixedOvertime, excessOvertime, statutoryOvertime, over60 },
    hourlyBase: Math.round(hourlyBase * 100) / 100,
    basePay,
    overtimePay,
    lateNightPay,
    legalHolidayPay,
    over60Pay,
    premiumTotal,
    fixedOvertimeAllowance: w.fixed_overtime_allowance,
    miscAllowance,
    commute,
    sideJobPay: input.side_job_pay,
    yearEndAdjustment: input.year_end_adjustment,
    absenceDeduction: input.absence_deduction,
    gross,
    deduction: input.deduction,
    warnings,
  };
}

/** 適用開始月が対象月以前のうち最新の賃金 */
export function wageForMonth<T extends { staff_id: string; valid_from: string }>(rows: T[], staffId: string, month: string): T | null {
  return (
    rows
      .filter((r) => r.staff_id === staffId && r.valid_from <= `${month}-01`)
      .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0] ?? null
  );
}
