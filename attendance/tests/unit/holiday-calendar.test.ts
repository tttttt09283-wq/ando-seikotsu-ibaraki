import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildCalendar, countCodes, defaultFromMonth } from "@/lib/holiday/calendar";
import { buildHolidayWorkbook } from "@/lib/holiday/export";
import { parseHolidayWorkbook } from "@/lib/holiday/import";

const base = { shifts: [], attendance: [], leaves: [], closedMonths: [] };

describe("休日管理カレンダー", () => {
  it("12か月・各月の日数で組み立て、区分の無い日はシステムの記録を参考に出す", () => {
    const months = buildCalendar({
      ...base,
      fromMonth: "2025-12",
      records: [
        { work_date: "2025-12-07", code: "legal_holiday", source: "manual" },
        { work_date: "2026-02-28", code: "furikyu", source: "import" },
      ],
      shifts: [{ work_date: "2025-12-08", shift_type: "scheduled_holiday" }],
      attendance: [
        { work_date: "2025-12-09", worked_minutes: 480, day_type: "scheduled_holiday", is_absent: false, late_minutes: 0, early_leave_minutes: 0 },
        { work_date: "2025-12-10", worked_minutes: 0, day_type: "workday", is_absent: true, late_minutes: 0, early_leave_minutes: 0 },
        { work_date: "2025-12-11", worked_minutes: 470, day_type: "workday", is_absent: false, late_minutes: 10, early_leave_minutes: 0 },
      ],
      leaves: [{ start_date: "2025-12-12", end_date: "2025-12-13", leave_type: "paid", unit: "full" }],
      closedMonths: ["2025-12"],
    });
    expect(months.map((m) => m.month)).toEqual(["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(months[2].days).toHaveLength(28);
    const dec = new Map(months[0].days.map((d) => [d.day, d]));
    expect(dec.get(7)).toMatchObject({ code: "legal_holiday", weekday: 0, closed: true });
    expect([8, 9, 10, 11, 12, 13].map((d) => dec.get(d)?.hint)).toEqual(["休み", "休出", "欠勤", "遅刻", "有休", "有休"]);
    expect(months[2].days[27]).toMatchObject({ code: "furikyu", source: "import", closed: false });
    expect(countCodes(months)).toMatchObject({ legal_holiday: 1, furikyu: 1, paid: 0 });
  });

  it("期間の始まり：基準日方式は直近の基準日の月、それ以外は今年の1月", () => {
    expect(defaultFromMonth("2026-10-20", "2023-12-01")).toBe("2025-12");
    expect(defaultFromMonth("2026-12-05", "2023-12-01")).toBe("2026-12");
    expect(defaultFromMonth("2026-10-20", null)).toBe("2026-01");
  });

  it("Excel に出力したファイルは、そのまま取込で同じ区分として読み込める", async () => {
    const months = buildCalendar({
      ...base,
      fromMonth: "2025-12",
      records: [
        { work_date: "2025-12-07", code: "legal_holiday", source: "manual" },
        { work_date: "2026-01-02", code: "holiday_work", source: "manual" },
        { work_date: "2026-11-30", code: "special_unpaid", source: "manual" },
      ],
    });
    const buffer = await buildHolidayWorkbook({
      staffName: "安藤 太郎",
      staffCode: "1001",
      hireDate: "2023-10-26",
      firstBaseDate: "2023-12-01",
      months,
      summary: [{ label: "休日出勤", value: 1 }],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const parsed = parseHolidayWorkbook(wb, "安藤太郎(勤怠管理表 2025-12~).xlsx");
    expect(parsed).toMatchObject({ name: "安藤太郎", hireDate: "2023-10-26", firstBaseDate: "2023-12-01", issues: [] });
    expect(parsed.records).toEqual([
      { date: "2025-12-07", code: "legal_holiday" },
      { date: "2026-01-02", code: "holiday_work" },
      { date: "2026-11-30", code: "special_unpaid" },
    ]);
  });
});
