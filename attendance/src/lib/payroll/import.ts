/**
 * 賃金管理表（残業代計算表・月ごとのシート）から賃金マスタを読み取る。
 *
 *   見出し行：「基礎賃金」「基本時給」の列がある行。氏名は見出し行の1列目（A列）
 *   月給：基礎賃金（X）と、基本時給の式「=X÷151」の 151（月の所定時間）
 *   残業の基準時間：超過残業数の式「=J+N−191−O」の 191
 *   時給：支給総額の式が「=基本時給×(通常＋有休)…」、日給：「=基礎賃金×出勤日数…」
 *   交通費：数値なら月額、「=150*B」なら日額150円
 *   固定残業代・資格・役職手当・雑手当：その月の値
 */
import type ExcelJS from "exceljs";
import { cellValue } from "@/lib/holiday/import";
import { normalizeHeaderText } from "@/lib/leave/import";
import { nameKey, parseSheetMonthEnd } from "@/lib/leave/snapshot";
import type { PayType } from "./calc";

export interface WageImportRow {
  row: number;
  name: string;
  nameKey: string;
  pay_type: PayType;
  basic_wage: number | null;
  hourly_wage: number | null;
  daily_wage: number | null;
  monthly_hours: number | null;
  overtime_threshold_hours: number | null;
  fixed_overtime_allowance: number;
  fixed_overtime_hours: number | null;
  commute_type: "none" | "monthly" | "per_day";
  commute_amount: number;
  qualification_allowance: number;
  misc_allowance: number;
}

const HEADERS = {
  base: ["基礎賃金"],
  hourly: ["基本時給"],
  excess: ["超過残業数"],
  fixedHours: ["固定残業数"],
  fixedPay: ["固定残業"],
  commute: ["交通費"],
  qualification: ["資格・役職手当"],
  misc: ["雑手当"],
  gross: ["支給総額"],
} as const;

const norm = (v: unknown) => normalizeHeaderText(v as never).replace(/[/／]/g, "");

/** 数式の文字列（共有数式はもとのセルの式を、その行に合わせて読む） */
function formulaOf(ws: ExcelJS.Worksheet, cell: ExcelJS.Cell): string | null {
  const v = cell.value as unknown as { formula?: string; sharedFormula?: string } | null;
  if (!v || typeof v !== "object") return null;
  if (v.formula) return v.formula;
  if (v.sharedFormula) {
    const master = ws.getCell(v.sharedFormula);
    const f = (master.value as unknown as { formula?: string } | null)?.formula;
    // 行番号だけ置き換える（同じ列の式をコピーしたもの）
    return f ? f.replace(new RegExp(`([A-Z]+)${master.row}(?!\\d)`, "g"), `$1${cell.row}`) : null;
  }
  return null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round1 = (v: number) => Math.round(v * 10) / 10;

export function parseWageSheet(ws: ExcelJS.Worksheet): { rows: WageImportRow[]; issues: { row: number; message: string }[]; month: string | null } {
  const issues: { row: number; message: string }[] = [];
  let headerRow = 0;
  const col: Partial<Record<keyof typeof HEADERS, number>> = {};
  for (let r = 1; r <= Math.min(15, ws.rowCount) && !headerRow; r++) {
    const found: typeof col = {};
    ws.getRow(r).eachCell({ includeEmpty: false }, (c) => {
      const h = norm(cellValue(c));
      for (const [key, names] of Object.entries(HEADERS) as [keyof typeof HEADERS, readonly string[]][]) {
        if (found[key] === undefined && names.some((n) => norm(n) === h)) found[key] = Number(c.col);
      }
    });
    if (found.base && found.hourly) {
      headerRow = r;
      Object.assign(col, found);
    }
  }
  const monthEnd = parseSheetMonthEnd(ws.name);
  const month = monthEnd ? monthEnd.slice(0, 7) : null;
  if (!headerRow) return { rows: [], issues: [{ row: 0, message: "見出し行（「基礎賃金」「基本時給」の列）が見つかりません" }], month };

  const rows: WageImportRow[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const nameCell = cellValue(ws.getCell(r, 1));
    const name = typeof nameCell === "string" ? nameCell.trim() : "";
    if (!name) continue;
    const get = (k: keyof typeof HEADERS) => (col[k] ? ws.getCell(r, col[k] as number) : undefined);
    const baseVal = num(cellValue(get("base")));
    const hourlyCell = get("hourly");
    const hourlyVal = num(cellValue(hourlyCell));
    const grossFormula = get("gross") ? (formulaOf(ws, get("gross") as ExcelJS.Cell) ?? "").replace(/\$/g, "") : "";
    const L = (k: keyof typeof HEADERS) => (col[k] ? ws.getColumn(col[k] as number).letter : "?");

    let pay_type: PayType;
    if (new RegExp(`${L("base")}${r}\\*B${r}|B${r}\\*${L("base")}${r}`).test(grossFormula)) pay_type = "daily";
    else if (new RegExp(`${L("hourly")}${r}\\*\\(`).test(grossFormula) || (baseVal === null && hourlyVal !== null)) pay_type = "hourly";
    else pay_type = "monthly";

    // 月の所定時間：基本時給の式「=X5/151」、無ければ 基礎賃金÷基本時給
    let monthlyHours: number | null = null;
    const hourlyFormula = hourlyCell ? formulaOf(ws, hourlyCell) : null;
    const m = hourlyFormula?.match(/\/\s*([\d.]+)\s*$/);
    if (m) monthlyHours = Number(m[1]);
    else if (pay_type === "monthly" && baseVal && hourlyVal) monthlyHours = round1(baseVal / hourlyVal);

    const excessFormula = get("excess") ? formulaOf(ws, get("excess") as ExcelJS.Cell) : null;
    const t = excessFormula?.match(/-\s*([\d.]+)(?![\d.]*[A-Z])/);
    const threshold = t ? Number(t[1]) : null;

    const commuteCell = get("commute");
    const commuteFormula = commuteCell ? formulaOf(ws, commuteCell) ?? "" : "";
    const perDay = commuteFormula.match(/(\d+)\s*\*\s*B\d+|B\d+\s*\*\s*(\d+)/);
    const commuteVal = num(cellValue(commuteCell));
    const commute_type = perDay ? "per_day" : commuteVal ? "monthly" : "none";
    const commute_amount = perDay ? Number(perDay[1] ?? perDay[2]) : commuteVal ?? 0;

    const row: WageImportRow = {
      row: r,
      name,
      nameKey: nameKey(name),
      pay_type,
      basic_wage: pay_type === "monthly" ? baseVal : null,
      hourly_wage: pay_type === "hourly" ? (hourlyVal === null ? null : Math.round(hourlyVal)) : null,
      daily_wage: pay_type === "daily" ? baseVal : null,
      monthly_hours: pay_type === "monthly" ? monthlyHours : null,
      overtime_threshold_hours: threshold,
      fixed_overtime_allowance: num(cellValue(get("fixedPay"))) ?? 0,
      fixed_overtime_hours: num(cellValue(get("fixedHours"))),
      commute_type,
      commute_amount: Math.round(commute_amount),
      qualification_allowance: num(cellValue(get("qualification"))) ?? 0,
      misc_allowance: num(cellValue(get("misc"))) ?? 0,
    };
    if (pay_type === "monthly" && (row.basic_wage === null || !row.monthly_hours)) {
      issues.push({ row: r, message: `${name}：基礎賃金または月の所定時間が読み取れません` });
      continue;
    }
    if (pay_type === "hourly" && row.hourly_wage === null) {
      issues.push({ row: r, message: `${name}：時給が読み取れません` });
      continue;
    }
    if (pay_type === "daily" && row.daily_wage === null) {
      issues.push({ row: r, message: `${name}：日給が読み取れません` });
      continue;
    }
    rows.push(row);
  }
  return { rows, issues, month };
}
