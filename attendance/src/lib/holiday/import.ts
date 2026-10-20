/**
 * 1人1ファイルの勤怠管理表（Excel）の読み取り。
 *
 * 現在の管理表の形：
 *   - 1シート = 基準日から1年分（シート名は「2024.10~」など。期間は見出しの日付で判断する）
 *   - 「前期末有休残」の行に、月ごとの見出し（その月の1日の日付）が3列おきに並ぶ（D・G・J…）
 *   - その下の31行に、各月「日（1日〜）・曜日・出勤区分」の3列
 *   - B列に集計（前期末有休残・次期繰り越し・前期振休繰り越し・振休・代休余 など）、上部に入社日・基準日
 *   - 氏名はファイル名（「山田　花子(基準日12月1日）」など）。無ければ「有休通知書」シートの宛名
 */
import type ExcelJS from "exceljs";
import { parseDateCell, type Cell } from "@/lib/leave/import";
import { nameKey } from "@/lib/leave/snapshot";
import { codeFromLabel, type DayCode } from "./codes";

export interface HolidayPeriod {
  sheet: string;
  start: string;
  end: string;
  paidCarryIn: number | null; // 前期末有休残
  paidNextCarry: number | null; // 次期繰り越し
  creditCarryIn: number | null; // 前期振休繰り越し
  creditRemaining: number | null; // 振休・代休余
  counts: Partial<Record<DayCode, number>>;
}

export interface HolidayFile {
  fileName: string;
  name: string | null;
  nameKey: string | null;
  hireDate: string | null;
  firstBaseDate: string | null;
  periods: HolidayPeriod[];
  records: { date: string; code: DayCode }[];
  issues: { level: "error" | "warn"; message: string }[];
}

/** セルの値（数式は計算結果、リッチテキストは文字列） */
export function cellValue(cell: ExcelJS.Cell | undefined): Cell {
  const v = cell?.value as unknown;
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v !== "object") return v as Cell;
  const o = v as { result?: unknown; richText?: { text: string }[]; text?: string; error?: string };
  if ("result" in o) return o.result instanceof Date || typeof o.result !== "object" ? (o.result as Cell) : null;
  if (o.richText) return o.richText.map((t) => t.text).join("");
  if (typeof o.text === "string") return o.text;
  return null;
}

const text = (v: Cell) => (v === null || v === undefined ? "" : String(v).normalize("NFKC").replace(/\s/g, ""));
const number = (v: Cell) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/** ファイル名から氏名：「山田　花子(基準日12月1日）.xlsx」→「山田　花子」 */
export function nameFromFileName(fileName: string): string | null {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/\.(xlsx|xlsm|xls)$/i, "");
  const name = base.replace(/[（(].*$/, "").trim();
  return name || null;
}

/** ラベルのセルを探して、その下のセルの値を返す（結合セルのため同じラベルが横に続く場合は最初の列） */
function valueBelow(ws: ExcelJS.Worksheet, label: string, maxRow = 60, maxCol = 60): Cell | undefined {
  for (let r = 1; r <= Math.min(maxRow, ws.rowCount); r++) {
    for (let c = 1; c <= maxCol; c++) {
      if (text(cellValue(ws.getCell(r, c))).startsWith(label)) return cellValue(ws.getCell(r + 1, c));
    }
  }
  return undefined;
}

function findLabelRow(ws: ExcelJS.Worksheet, label: string): { row: number; col: number } | null {
  for (let r = 1; r <= Math.min(80, ws.rowCount); r++) {
    for (let c = 1; c <= 6; c++) {
      if (text(cellValue(ws.getCell(r, c))) === label) return { row: r, col: c };
    }
  }
  return null;
}

const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");

function parsePeriodSheet(ws: ExcelJS.Worksheet, issues: HolidayFile["issues"]): { period: HolidayPeriod; records: HolidayFile["records"] } | null {
  const anchor = findLabelRow(ws, "前期末有休残");
  if (!anchor) return null;
  const records: HolidayFile["records"] = [];
  const counts: Partial<Record<DayCode, number>> = {};
  const months: string[] = [];
  for (let col = anchor.col + 2; col <= anchor.col + 2 + 3 * 13; col += 3) {
    const month = parseDateCell(cellValue(ws.getCell(anchor.row, col)));
    if (!month) {
      if (months.length > 0) break;
      continue;
    }
    const [y, m] = month.split("-").map(Number);
    months.push(`${y}-${pad(m)}`);
    for (let r = anchor.row + 1; r <= anchor.row + 31; r++) {
      const dayMatch = text(cellValue(ws.getCell(r, col))).match(/^(\d{1,2})/);
      const label = String(cellValue(ws.getCell(r, col + 2)) ?? "").trim();
      if (!dayMatch || !label) continue;
      const day = Number(dayMatch[1]);
      if (day < 1 || day > lastDayOfMonth(y, m)) continue;
      const date = `${y}-${pad(m)}-${pad(day)}`;
      const code = codeFromLabel(label);
      if (!code) {
        issues.push({ level: "warn", message: `シート「${ws.name}」${date}：区分「${label}」は読み取れないため取り込みません` });
        continue;
      }
      records.push({ date, code });
      counts[code] = (counts[code] ?? 0) + 1;
    }
  }
  if (months.length === 0) return null;
  const [ly, lm] = months[months.length - 1].split("-").map(Number);
  const read = (label: string) => {
    const at = findLabelRow(ws, label);
    return at ? number(cellValue(ws.getCell(at.row + 1, at.col))) : null;
  };
  const creditCarryIn = read("前期振休繰り越し");
  const n = (c: DayCode) => counts[c] ?? 0;
  // 管理表の計算式：前期繰越 ＋ 休出 ＋ 半出勤×0.5 − 振休・代休 − 振半休・代半休×0.5
  const computedCredit =
    (creditCarryIn ?? 0) + n("holiday_work") + n("half_work") * 0.5 - n("furikyu") - n("daikyu") - (n("furikyu_half") + n("daikyu_half")) * 0.5;
  return {
    period: {
      sheet: ws.name,
      start: `${months[0]}-01`,
      end: `${ly}-${pad(lm)}-${pad(lastDayOfMonth(ly, lm))}`,
      paidCarryIn: read("前期末有休残"),
      paidNextCarry: read("次期繰り越し"),
      creditCarryIn,
      creditRemaining: read("振休・代休余") ?? computedCredit,
      counts,
    },
    records,
  };
}

/** 1ファイルを読み取る */
export function parseHolidayWorkbook(wb: ExcelJS.Workbook, fileName: string): HolidayFile {
  const issues: HolidayFile["issues"] = [];
  const periods: HolidayPeriod[] = [];
  const byDate = new Map<string, DayCode>();
  let hireDate: string | null = null;
  let firstBaseDate: string | null = null;

  for (const ws of wb.worksheets) {
    if (ws.state !== "visible") continue;
    const parsed = parsePeriodSheet(ws, issues);
    if (!parsed) continue;
    periods.push(parsed.period);
    for (const r of parsed.records) byDate.set(r.date, r.code); // 期間が重なる場合は後のシートを優先
    hireDate ??= parseDateCell(valueBelow(ws, "入社日") ?? null);
    firstBaseDate ??= parseDateCell(valueBelow(ws, "基準日") ?? null);
  }
  periods.sort((a, b) => a.start.localeCompare(b.start));

  let name = nameFromFileName(fileName);
  if (!name) {
    const notice = wb.worksheets.find((w) => w.name.includes("通知書"));
    const addressee = notice ? String(cellValue(notice.getCell("A1")) ?? "").trim().replace(/殿$/, "").trim() : "";
    name = addressee || null;
  }
  if (!name) issues.push({ level: "error", message: "氏名が読み取れません（ファイル名を「氏名(基準日…).xlsx」にしてください）" });
  if (periods.length === 0) issues.push({ level: "error", message: "勤怠管理表のシートが見つかりません（「前期末有休残」の行が必要です）" });

  return {
    fileName,
    name,
    nameKey: name ? nameKey(name) : null,
    hireDate,
    firstBaseDate,
    periods,
    records: [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, code]) => ({ date, code })),
    issues,
  };
}
