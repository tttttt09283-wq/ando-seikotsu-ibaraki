import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { codeFromLabel } from "@/lib/holiday/codes";
import { nameFromFileName, parseHolidayWorkbook } from "@/lib/holiday/import";
import { grantDateOf, nextPlannedGrant } from "@/lib/leave/schedule";

/** 現在の勤怠管理表と同じ配置のシートを作る（月の見出しは D・G・J… 列、日ごとに「日・曜日・区分」） */
function addPeriodSheet(wb: ExcelJS.Workbook, name: string, startMonth: string, codes: Record<string, string>, summary: Record<string, number>) {
  const ws = wb.addWorksheet(name);
  ws.getCell("AA1").value = "入社日";
  ws.getCell("AA2").value = new Date(Date.UTC(2023, 9, 26));
  ws.getCell("AA3").value = "基準日";
  ws.getCell("AA4").value = new Date(Date.UTC(2023, 11, 1));
  ws.getCell("B6").value = "前期末有休残";
  const labels: [number, string][] = [
    [8, "繰越日数(MAX20)"],
    [16, "前期振休繰り越し"],
    [18, "次期繰り越し"],
    [30, "振休・代休余"],
  ];
  for (const [row, label] of labels) ws.getCell(row, 2).value = label;
  ws.getCell("B7").value = summary.carryIn;
  if (summary.creditCarryIn !== undefined) ws.getCell("B17").value = summary.creditCarryIn;
  ws.getCell("B19").value = { formula: "B13-B15", result: summary.nextCarry } as ExcelJS.CellFormulaValue;
  const [y, m] = startMonth.split("-").map(Number);
  for (let k = 0; k < 12; k++) {
    const col = 4 + k * 3;
    const first = new Date(Date.UTC(y, m - 1 + k, 1));
    ws.getCell(6, col).value = first;
    const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    for (let d = 1; d <= days; d++) {
      ws.getCell(6 + d, col).value = `${d}日`;
      ws.getCell(6 + d, col + 1).value = "月";
      const key = `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (codes[key]) ws.getCell(6 + d, col + 2).value = codes[key];
    }
  }
  ws.getCell("AN6").value = "休出"; // 凡例（読み取りの対象外）
}

describe("勤怠管理表（1人1ファイル）の読み取り", () => {
  it("区分・入社日・基準日・繰越を読み取り、振休・代休の残りを管理表の式で計算する", () => {
    const wb = new ExcelJS.Workbook();
    addPeriodSheet(
      wb,
      "2024.10~",
      "2024-12",
      {
        "2024-12-01": "法定内",
        "2024-12-02": "振休",
        "2024-12-04": "法定外",
        "2025-01-01": "特休(有)",
        "2025-01-02": "休出",
        "2025-01-03": "計画年休",
        "2025-02-06": "振半休",
        "2025-03-08": "半出勤",
        "2025-11-30": "休出",
        "2025-02-30": "休出", // 存在しない日は無視
      },
      { carryIn: 3, nextCarry: 7, creditCarryIn: 1.5 },
    );
    addPeriodSheet(wb, "2025.12~", "2025-12", { "2025-12-03": "法定外", "2026-01-04": "謎の区分" }, { carryIn: 7, nextCarry: 9 });
    const notice = wb.addWorksheet("有休通知書");
    notice.getCell("A1").value = "　　安藤　太郎殿";

    const f = parseHolidayWorkbook(wb, "安藤　太郎(基準日12月1日）.xlsx");
    expect(f).toMatchObject({ name: "安藤　太郎", nameKey: "安藤太郎", hireDate: "2023-10-26", firstBaseDate: "2023-12-01" });
    expect(f.records).toEqual([
      { date: "2024-12-01", code: "legal_holiday" },
      { date: "2024-12-02", code: "furikyu" },
      { date: "2024-12-04", code: "non_legal_holiday" },
      { date: "2025-01-01", code: "special_paid" },
      { date: "2025-01-02", code: "holiday_work" },
      { date: "2025-01-03", code: "planned_paid" },
      { date: "2025-02-06", code: "furikyu_half" },
      { date: "2025-03-08", code: "half_work" },
      { date: "2025-11-30", code: "holiday_work" },
      { date: "2025-12-03", code: "non_legal_holiday" },
    ]);
    expect(f.periods.map((p) => [p.sheet, p.start, p.end, p.paidCarryIn, p.paidNextCarry])).toEqual([
      ["2024.10~", "2024-12-01", "2025-11-30", 3, 7],
      ["2025.12~", "2025-12-01", "2026-11-30", 7, 9],
    ]);
    // 1.5 ＋ 休出2 ＋ 半出勤0.5 − 振休1 − 振半休0.5 ＝ 2.5
    expect(f.periods[0].creditRemaining).toBe(2.5);
    expect(f.issues).toEqual([{ level: "warn", message: "シート「2025.12~」2026-01-04：区分「謎の区分」は読み取れないため取り込みません" }]);
  });

  it("ファイル名から氏名を取り出す（無ければ有休通知書の宛名）", () => {
    expect(nameFromFileName("岡田　一郎(基準日12月1日）.xlsx")).toBe("岡田　一郎");
    expect(nameFromFileName("勤怠/岡田一郎（基準日4月1日）.xlsx")).toBe("岡田一郎");
    const wb = new ExcelJS.Workbook();
    addPeriodSheet(wb, "2025.12~", "2025-12", {}, { carryIn: 0, nextCarry: 0 });
    wb.addWorksheet("有休通知書").getCell("A1").value = "　　　岡田　一郎殿";
    expect(parseHolidayWorkbook(wb, "(基準日12月1日).xlsx").name).toBe("岡田　一郎");
  });

  it("勤怠管理表でないファイルはエラー", () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Sheet1").getCell("A1").value = "x";
    expect(parseHolidayWorkbook(wb, "山田.xlsx").issues).toEqual([
      { level: "error", message: "勤怠管理表のシートが見つかりません（「前期末有休残」の行が必要です）" },
    ]);
  });

  it("表記ゆれ（全角括弧・空白）も区分として読む", () => {
    expect(codeFromLabel("特休（有）")).toBe("special_paid");
    expect(codeFromLabel(" 法定内 ")).toBe("legal_holiday");
    expect(codeFromLabel("代半休")).toBe("daikyu_half");
    expect(codeFromLabel("出勤")).toBeNull();
  });
});

describe("有休の付与方式：基準日方式", () => {
  const fullTime = { weeklyDays: 5, weeklyMinutes: 2400 };
  const basis = { kind: "base_date" as const, firstBaseDate: "2023-12-01" };

  it("最初の基準日から毎年同じ月日に、回数に応じた法定日数を付与する", () => {
    expect([0, 1, 2].map((i) => grantDateOf("2023-10-26", i, basis))).toEqual(["2023-12-01", "2024-12-01", "2025-12-01"]);
    expect(nextPlannedGrant("2023-10-26", fullTime, ["2023-12-01", "2024-12-01"], "2025-11-20", 30, basis)).toEqual({
      grantDate: "2025-12-01",
      index: 2,
      days: 12,
      type: "statutory",
    });
    // 入社日基準なら 2024-04-26・2025-04-26…
    expect(grantDateOf("2023-10-26", 1)).toBe("2025-04-26");
  });
});
