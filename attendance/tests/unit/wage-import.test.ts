import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseWageSheet } from "@/lib/payroll/import";

/** 残業代計算表と同じ列の並び（A氏名・B出勤日数…O固定残業数・P超過残業数…X基礎賃金・Y基本時給…AC固定残業・AD交通費・AE資格・役職手当・AF雑手当…AI支給総額） */
function sheet() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("R8.9");
  ws.getCell("A1").value = "残業代計算表";
  const heads: Record<string, string> = {
    B4: "出勤日数", J4: "通常", N4: "有休", O4: "固定\n残業数", P4: "超過\n残業数", X4: "基礎賃金", Y4: "基本時給", Z4: "残業（×1.25）",
    AC4: "固定残業", AD4: "交通費", AE4: "資格・役職手当", AF4: "雑手当", AG4: "別バイト\nMG代", AH4: "年末調整", AI4: "支給総額",
  };
  for (const [a, v] of Object.entries(heads)) ws.getCell(a).value = v;
  ws.getCell("A4").value = { formula: "COUNTA(A5:A43)", result: 3 } as ExcelJS.CellFormulaValue;
  // 月給（月の所定151時間・基準191時間・交通費 月額）
  ws.getCell("A5").value = "安藤　太郎";
  ws.getCell("O5").value = 24;
  ws.getCell("P5").value = { formula: "J5+N5-191-O5", result: 0 } as ExcelJS.CellFormulaValue;
  ws.getCell("X5").value = 240000;
  ws.getCell("Y5").value = { formula: "X5/151", result: 240000 / 151 } as ExcelJS.CellFormulaValue;
  ws.getCell("AC5").value = 30000;
  ws.getCell("AD5").value = 10000;
  ws.getCell("AE5").value = 30000;
  ws.getCell("AI5").value = { formula: "X5+AF5+AC5+U5+AD5+AG5+AH5", result: 280000 } as ExcelJS.CellFormulaValue;
  // 時給（交通費 日額150円）
  ws.getCell("A6").value = "山田　花子";
  ws.getCell("Y6").value = 1177;
  ws.getCell("AD6").value = { formula: "150*B6", result: 3000 } as ExcelJS.CellFormulaValue;
  ws.getCell("AI6").value = { formula: "Y6*(J6+N6)+AD6+U6+AF6+AG6+AH6", result: 0 } as ExcelJS.CellFormulaValue;
  // 日給
  ws.getCell("A7").value = "佐藤　次郎";
  ws.getCell("X7").value = 12000;
  ws.getCell("Y7").value = { formula: "X7/190.6", result: 62.96 } as ExcelJS.CellFormulaValue;
  ws.getCell("AI7").value = { formula: "X7*B7+AG7+AH7", result: 0 } as ExcelJS.CellFormulaValue;
  // 読み取れない行
  ws.getCell("A8").value = "鈴木　三郎";
  ws.getCell("AI8").value = { formula: "X8+AC8", result: 0 } as ExcelJS.CellFormulaValue;
  return ws;
}

describe("賃金管理表からの賃金マスタの読み取り", () => {
  it("月給・時給・日給を支給総額の式から判定し、月の所定時間・基準時間・交通費の種類を式から読む", () => {
    const { rows, issues, month } = parseWageSheet(sheet());
    expect(month).toBe("2026-09");
    expect(rows).toEqual([
      {
        row: 5, name: "安藤　太郎", nameKey: "安藤太郎", pay_type: "monthly", basic_wage: 240000, hourly_wage: null, daily_wage: null,
        monthly_hours: 151, overtime_threshold_hours: 191, fixed_overtime_allowance: 30000, fixed_overtime_hours: 24,
        commute_type: "monthly", commute_amount: 10000, qualification_allowance: 30000, misc_allowance: 0,
      },
      expect.objectContaining({ name: "山田　花子", pay_type: "hourly", hourly_wage: 1177, monthly_hours: null, commute_type: "per_day", commute_amount: 150 }),
      expect.objectContaining({ name: "佐藤　次郎", pay_type: "daily", daily_wage: 12000, commute_type: "none" }),
    ]);
    expect(issues).toEqual([{ row: 8, message: "鈴木　三郎：基礎賃金または月の所定時間が読み取れません" }]);
  });
});
