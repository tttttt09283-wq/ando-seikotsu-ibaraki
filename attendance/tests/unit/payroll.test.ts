import { describe, expect, it } from "vitest";
import { calcPayroll, roundMonthHours, wageForMonth, type MonthAttendance, type WageSetting } from "@/lib/payroll/calc";

const monthly: WageSetting = {
  pay_type: "monthly",
  basic_wage: 240000,
  qualification_allowance: 30000,
  hourly_wage: null,
  daily_wage: null,
  monthly_hours: 151,
  overtime_threshold_hours: 191,
  fixed_overtime_allowance: 30000,
  commute_type: "monthly",
  commute_amount: 10000,
  misc_allowance: 0,
};

const attendance = (over: Partial<MonthAttendance> = {}): MonthAttendance => ({
  workDays: 22,
  workedMinutes: 220 * 60,
  lateNightMinutes: 10 * 60,
  nonLegalHolidayMinutes: 0,
  legalHolidayMinutes: 8 * 60,
  statutoryOvertimeMinutes: 50 * 60,
  paidLeaveDays: 1,
  dailyScheduledMinutes: 480,
  fixedOvertimeMinutes: 24 * 60,
  ...over,
});

describe("残業代計算", () => {
  it("月の合計は30分未満切り捨て・30分以上切り上げ", () => {
    expect(roundMonthHours(205 * 60 + 29)).toBe(205);
    expect(roundMonthHours(205 * 60 + 30)).toBe(206);
    expect(roundMonthHours(0)).toBe(0);
  });

  it("月給：基本時給＝基礎賃金÷月の所定時間、超過残業＝通常＋有休−基準時間−固定残業（×1.25）、深夜×0.25、法定休日×0.35", () => {
    const r = calcPayroll(monthly, attendance());
    // 基本時給 240000 / 151 = 1589.40…
    expect(r.hourlyBase).toBe(1589.4);
    // 220 + 8 − 191 − 24 = 13時間
    expect(r.hours).toMatchObject({ total: 220, paidLeave: 8, fixedOvertime: 24, excessOvertime: 13, lateNight: 10, legalHoliday: 8 });
    expect(r.overtimePay).toBe(Math.round((13 * 240000 * 1.25) / 151)); // 25828
    expect(r.lateNightPay).toBe(Math.round((10 * 240000 * 0.25) / 151)); // 3974
    expect(r.legalHolidayPay).toBe(Math.round((8 * 240000 * 0.35) / 151)); // 4450
    expect(r.over60Pay).toBe(0);
    // 基礎賃金＋固定残業代＋割増＋交通費
    expect(r.gross).toBe(240000 + 30000 + 25828 + 3974 + 4450 + 10000);
    expect(r.warnings).toEqual([]);
  });

  it("固定残業の範囲内なら超過残業は0（マイナスにしない）", () => {
    expect(calcPayroll(monthly, attendance({ workedMinutes: 200 * 60 })).overtimePay).toBe(0);
  });

  it("月60時間を超える法定時間外は＋25%（管理表に無い分を追加）", () => {
    const r = calcPayroll(monthly, attendance({ statutoryOvertimeMinutes: 75 * 60 }));
    expect(r.hours.over60).toBe(15);
    expect(r.over60Pay).toBe(Math.round((15 * 240000 * 0.25) / 151));
    expect(r.warnings[0]).toContain("60時間");
  });

  it("時給：時給×（通常＋有休）、超過分は＋25%のみ（時給で払い済み）、交通費は日額×出勤日数", () => {
    const hourly: WageSetting = { ...monthly, pay_type: "hourly", basic_wage: null, hourly_wage: 1200, monthly_hours: null, overtime_threshold_hours: null, fixed_overtime_allowance: 0, commute_type: "per_day", commute_amount: 150 };
    const r = calcPayroll(hourly, attendance({ workDays: 15, workedMinutes: 100 * 60 + 29, paidLeaveDays: 0, lateNightMinutes: 0, legalHolidayMinutes: 0, statutoryOvertimeMinutes: 3 * 60, fixedOvertimeMinutes: 0 }));
    expect(r.basePay).toBe(120000);
    expect(r.overtimePay).toBe(900); // 3時間 × 1200 × 0.25
    expect(r.commute).toBe(2250);
    expect(r.gross).toBe(120000 + 900 + 2250);
  });

  it("日給：日給×（出勤日数＋有休日数）。手入力（別バイト・年末調整・欠勤控除・雑手当の上書き）を反映", () => {
    const daily: WageSetting = { ...monthly, pay_type: "daily", basic_wage: null, daily_wage: 10000, monthly_hours: null, overtime_threshold_hours: null, fixed_overtime_allowance: 0, commute_type: "none", misc_allowance: 3000 };
    const r = calcPayroll(daily, attendance({ workDays: 10, workedMinutes: 80 * 60, lateNightMinutes: 0, legalHolidayMinutes: 0, statutoryOvertimeMinutes: 0, fixedOvertimeMinutes: 0 }), {
      side_job_days: 2,
      side_job_pay: 8000,
      year_end_adjustment: -1500,
      absence_deduction: 4000,
      misc_allowance: 5000,
      deduction: 20000,
    });
    expect(r.hourlyBase).toBe(1250);
    expect(r.basePay).toBe(110000);
    expect(r.miscAllowance).toBe(5000);
    expect(r.gross).toBe(110000 + 5000 + 8000 - 1500 - 4000);
    expect(r.deduction).toBe(20000);
  });

  it("賃金未登録・みなし残業時間の未設定を知らせる", () => {
    expect(calcPayroll({ ...monthly, basic_wage: 0 }, attendance()).warnings).toContain("賃金（基礎賃金・時給・日給）が未登録です");
    expect(calcPayroll(monthly, attendance({ fixedOvertimeMinutes: 0 })).warnings[0]).toContain("みなし残業時間が0");
  });

  it("対象月に有効な賃金（適用開始月が対象月以前で最新）を選ぶ", () => {
    const rows = [
      { staff_id: "a", valid_from: "2026-04-01", v: 1 },
      { staff_id: "a", valid_from: "2026-10-01", v: 2 },
      { staff_id: "b", valid_from: "2026-01-01", v: 3 },
    ];
    expect(wageForMonth(rows, "a", "2026-09")?.v).toBe(1);
    expect(wageForMonth(rows, "a", "2026-10")?.v).toBe(2);
    expect(wageForMonth(rows, "a", "2026-03")).toBeNull();
  });
});
