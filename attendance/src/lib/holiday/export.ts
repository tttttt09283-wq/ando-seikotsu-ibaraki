/**
 * 休日管理カレンダーの Excel 出力。今の勤怠管理表（1人1ファイル）と同じ配置にするため、
 * 出力したファイルはそのまま取込にも使える（月の見出し：6行目の D・G・J…列、日ごと「日・曜日・区分」）。
 */
import ExcelJS from "exceljs";
import { WEEKDAY_LABELS } from "@/lib/time/jst";
import { DAY_CODE_LABELS, DAY_CODES } from "./codes";
import type { CalendarMonth } from "./calendar";

export interface HolidayExportInput {
  staffName: string;
  staffCode: string;
  hireDate: string;
  firstBaseDate: string | null;
  months: CalendarMonth[];
  summary: { label: string; value: number }[];
}

const toDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

export async function buildHolidayWorkbook(input: HolidayExportInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "あんど整骨院グループ 勤怠管理";
  const first = input.months[0]?.month ?? "";
  const ws = wb.addWorksheet(`${first.replace("-", ".")}~`, { views: [{ state: "frozen", xSplit: 2, ySplit: 6 }] });

  ws.getCell("B2").value = "勤怠管理表";
  ws.getCell("B2").font = { bold: true, size: 14 };
  ws.getCell("P2").value = "氏名";
  ws.getCell("Q2").value = `${input.staffName}（${input.staffCode}）`;
  ws.getCell("AA1").value = "入社日";
  ws.getCell("AA2").value = toDate(input.hireDate);
  ws.getCell("AA3").value = "基準日";
  if (input.firstBaseDate) ws.getCell("AA4").value = toDate(input.firstBaseDate);
  for (const a of ["AA2", "AA4"]) ws.getCell(a).numFmt = "yyyy/mm/dd";

  // B列：集計（取込時の目印として「前期末有休残」を先頭に置く）
  ws.getCell("B6").value = "前期末有休残";
  input.summary.forEach((s, i) => {
    ws.getCell(8 + i * 2, 2).value = s.label;
    ws.getCell(9 + i * 2, 2).value = s.value;
  });
  ws.getColumn(2).width = 22;

  input.months.forEach((m, k) => {
    const col = 4 + k * 3;
    const head = ws.getCell(6, col);
    head.value = toDate(`${m.month}-01`);
    head.numFmt = "yyyy年m月";
    head.font = { bold: true };
    ws.mergeCells(6, col, 6, col + 2);
    for (const d of m.days) {
      const row = 6 + d.day;
      ws.getCell(row, col).value = `${d.day}日`;
      const wd = ws.getCell(row, col + 1);
      wd.value = WEEKDAY_LABELS[d.weekday];
      if (d.weekday === 0) wd.font = { color: { argb: "FFDC2626" } };
      if (d.weekday === 6) wd.font = { color: { argb: "FF0284C7" } };
      if (d.code) ws.getCell(row, col + 2).value = DAY_CODE_LABELS[d.code];
    }
    ws.getColumn(col).width = 5;
    ws.getColumn(col + 1).width = 3;
    ws.getColumn(col + 2).width = 8;
  });

  // 凡例
  const legendCol = 4 + input.months.length * 3 + 1;
  ws.getCell(5, legendCol).value = "出勤区分";
  DAY_CODES.forEach((c, i) => {
    ws.getCell(6 + i, legendCol).value = c.label;
    ws.getCell(6 + i, legendCol + 1).value = c.description;
  });
  ws.getColumn(legendCol).width = 10;
  ws.getColumn(legendCol + 1).width = 40;

  return Buffer.from(await wb.xlsx.writeBuffer());
}
