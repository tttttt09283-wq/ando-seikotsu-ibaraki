import { describe, expect, it } from "vitest";
import { previousMonthMapping, previousMonthSourceDate } from "@/lib/shifts/copy";
import { shiftLabel, spanBetween, toShiftView, type ShiftView } from "@/lib/shifts/model";
import { dayWarnings, missingDates, noStaffDates, requiredBreakMinutes, weeklyWarnings, type ClinicDay } from "@/lib/shifts/warnings";
import { monthDates } from "@/lib/time/jst";

const CLINIC = "c1";
const OTHER = "c2";

function shift(date: string, start: string, end: string, breakMinutes: number, overrides: Partial<ShiftView> = {}): ShiftView {
  const span = spanBetween(start, end);
  return {
    shiftId: `${date}-${start}`,
    staffId: "s1",
    clinicId: CLINIC,
    workDate: date,
    type: "work",
    status: "draft",
    version: 1,
    start,
    end,
    endsNextDay: end <= start,
    breakMinutes,
    workMinutes: span - breakMinutes,
    spanMinutes: span,
    templateId: null,
    note: null,
    ...overrides,
  };
}

const openDay = (date: string, holidayName: string | null = null): ClinicDay => ({
  date,
  slots: [
    { open: "09:00", close: "12:30" },
    { open: "15:00", close: "20:00" },
  ],
  holidayName,
});

describe("DB行の変換", () => {
  it("UTC の時刻を日本時間で表示し、日跨ぎを判定する", () => {
    const view = toShiftView({
      shift_id: "x",
      staff_id: "s",
      clinic_id: "c",
      work_date: "2026-11-02",
      scheduled_start: "2026-11-02T09:00:00Z", // 18:00 JST
      scheduled_end: "2026-11-02T17:00:00Z", // 翌 02:00 JST
      scheduled_break_minutes: 60,
      shift_type: "work",
      status: "draft",
      version: 1,
      template_id: null,
      note: null,
    });
    expect(view).toMatchObject({ start: "18:00", end: "02:00", endsNextDay: true, spanMinutes: 480, workMinutes: 420 });
    expect(shiftLabel(view)).toBe("18:00-翌02:00");
  });
});

describe("シフトの警告", () => {
  it("休憩は労働6時間超で45分、8時間超で60分が必要", () => {
    expect(requiredBreakMinutes(360)).toBe(0);
    expect(requiredBreakMinutes(361)).toBe(45);
    expect(requiredBreakMinutes(481)).toBe(60);
    const codes = dayWarnings("s1", [shift("2026-11-02", "09:00", "18:00", 30)], openDay("2026-11-02"), CLINIC).map((w) => w.code);
    expect(codes).toContain("break_shortage");
  });

  it("9:00〜20:00・休憩3時間（実働8時間）は警告なし", () => {
    expect(dayWarnings("s1", [shift("2026-11-02", "09:00", "20:00", 180)], openDay("2026-11-02"), CLINIC)).toEqual([]);
  });

  it("1日8時間超・休診日・診療時間外・祝日勤務を検出する", () => {
    const long = dayWarnings("s1", [shift("2026-11-02", "08:00", "20:00", 60)], openDay("2026-11-02"), CLINIC).map((w) => w.code);
    expect(long).toEqual(expect.arrayContaining(["daily_over", "outside_hours"]));

    const closed = dayWarnings("s1", [shift("2026-11-04", "09:00", "18:00", 60)], { date: "2026-11-04", slots: [], holidayName: null }, CLINIC);
    expect(closed.map((w) => w.code)).toEqual(["closed_day"]);

    const holiday = dayWarnings("s1", [shift("2026-11-23", "09:00", "18:00", 60)], openDay("2026-11-23", "勤労感謝の日"), CLINIC);
    expect(holiday.map((w) => w.code)).toEqual(["holiday_work"]);
  });

  it("他院での応援勤務は休診・診療時間の判定に使わないが、1日の合計時間には含める", () => {
    const shifts = [shift("2026-11-04", "09:00", "13:00", 0, { clinicId: OTHER }), shift("2026-11-04", "14:00", "20:00", 0)];
    const codes = dayWarnings("s1", shifts, openDay("2026-11-04"), CLINIC).map((w) => w.code);
    expect(codes).toContain("daily_over");
    expect(codes).not.toContain("closed_day");
  });

  it("同じ日に勤務と休みが両方あればエラー", () => {
    const shifts = [shift("2026-11-02", "09:00", "18:00", 60), shift("2026-11-02", "09:00", "09:00", 0, { type: "scheduled_holiday" })];
    expect(dayWarnings("s1", shifts, openDay("2026-11-02"), CLINIC).map((w) => w.code)).toContain("work_and_day_off");
  });

  it("週5日・週40時間を超える週を検出する（日曜始まり）", () => {
    // 2026-11-01（日）〜 11-07（土）に6日勤務
    const week = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"].map((d) => shift(d, "09:00", "18:00", 60));
    const codes = weeklyWarnings("s1", week, monthDates("2026-11")).map((w) => w.code);
    expect(codes).toEqual(["weekly_days_over", "weekly_over"]);
    expect(weeklyWarnings("s1", week.slice(0, 5), monthDates("2026-11"))).toEqual([]);
  });

  it("シフト未作成の日と、勤務者0人の日を検出する", () => {
    const days = [openDay("2026-11-02"), { date: "2026-11-04", slots: [], holidayName: null }, openDay("2026-11-05")];
    const shifts = [shift("2026-11-02", "09:00", "18:00", 60)];
    expect(missingDates(shifts, days, () => true)).toEqual(["2026-11-05"]);
    expect(missingDates(shifts, days, (d) => d < "2026-11-05")).toEqual([]);
    expect(noStaffDates(shifts, days)).toEqual(["2026-11-05"]);
  });
});

describe("前月コピー", () => {
  it("第n○曜日を前月の第n○曜日からコピーする", () => {
    expect(previousMonthSourceDate("2026-11-02")).toBe("2026-10-05"); // 第1月曜
    expect(previousMonthSourceDate("2026-11-30")).toBe("2026-10-26"); // 第5月曜 → 10月の最後の月曜
    expect(previousMonthSourceDate("2027-01-01")).toBe("2026-12-04"); // 年をまたぐ（第1金曜）
  });

  it("コピー元は必ず同じ曜日", () => {
    for (const { target, source } of previousMonthMapping("2026-12")) {
      expect(new Date(`${source}T00:00:00Z`).getUTCDay()).toBe(new Date(`${target}T00:00:00Z`).getUTCDay());
      expect(source.slice(0, 7)).toBe("2026-11");
    }
  });
});

describe("勤怠の表示", () => {
  it("分を時:分で表示し、みなし残業の超過分を計算する", async () => {
    const { hm, fixedOvertimeExcess } = await import("@/lib/attendance/labels");
    expect(hm(485)).toBe("8:05");
    expect(hm(0)).toBe("0:00");
    expect(fixedOvertimeExcess(30 * 60, 24 * 60)).toBe(360);
    expect(fixedOvertimeExcess(10 * 60, 24 * 60)).toBe(0);
  });
});
