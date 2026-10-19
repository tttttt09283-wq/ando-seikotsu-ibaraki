/**
 * 帳票ファイルの書き出し（CSV・Excel）。帳票の中身に依存しない部分。
 *
 * - CSV は CRLF 改行。文字コードは UTF-8（BOM 付き：Excel でそのまま開ける）または Shift_JIS（CP932：古い Excel・給与ソフト向け）
 * - 「=」「+」「-」「@」で始まる文字列は先頭に「'」を付け、Excel で数式として実行されないようにする（CSV インジェクション対策）
 * - Shift_JIS に無い文字（一部の絵文字・外字など）は「?」に置き換わる。置き換わる文字は cp932Unmappable で確認できる
 */
import ExcelJS from "exceljs";
import iconv from "iconv-lite";

export type ExportCell = string | number | null | undefined;

export interface ExportTable {
  title: string;
  headers: string[];
  rows: ExportCell[][];
  /** Excel の列ごとの数値書式（例："0.00"）。未指定は標準 */
  numberFormats?: (string | undefined)[];
}

export type ExportFormat = "csv_utf8" | "csv_sjis" | "xlsx";

export const EXPORT_FORMATS: Record<ExportFormat, { label: string; extension: string; contentType: string }> = {
  csv_utf8: { label: "CSV（UTF-8・BOM付き）", extension: "csv", contentType: "text/csv; charset=utf-8" },
  csv_sjis: { label: "CSV（Shift_JIS・Excel互換）", extension: "csv", contentType: "text/csv; charset=shift_jis" },
  xlsx: { label: "Excel（.xlsx）", extension: "xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
};

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** 文字列セルの数式化を防ぐ（数値はそのまま） */
export function sanitizeCell(value: ExportCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

function quote(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** 表を CSV の文字列にする（CRLF 改行・末尾にも改行） */
export function toCsv(table: Pick<ExportTable, "headers" | "rows">): string {
  return [table.headers, ...table.rows].map((row) => row.map((c) => quote(sanitizeCell(c))).join(",")).join("\r\n") + "\r\n";
}

/** CSV 文字列を指定の文字コードのバイト列にする */
export function encodeCsv(text: string, encoding: "utf8" | "sjis"): Buffer {
  if (encoding === "utf8") return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, "utf8")]);
  return iconv.encode(text, "cp932");
}

/** Shift_JIS（CP932）で表せない文字の一覧（重複なし） */
export function cp932Unmappable(text: string): string[] {
  const out = new Set<string>();
  for (const ch of text) {
    if (ch === "?") continue;
    if (iconv.decode(iconv.encode(ch, "cp932"), "cp932") !== ch) out.add(ch);
  }
  return [...out];
}

/** Excel（.xlsx）を作る。1行目に見出し（太字・固定）、数値は数値として保存 */
export async function buildXlsx(table: ExportTable): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "あんど整骨院グループ 勤怠管理";
  const ws = wb.addWorksheet(table.title.slice(0, 31).replace(/[\\/?*[\]:]/g, "_"), { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow(table.headers).font = { bold: true };
  for (const row of table.rows) {
    ws.addRow(row.map((c) => (typeof c === "number" ? c : c === null || c === undefined ? null : sanitizeCell(c))));
  }
  table.headers.forEach((h, i) => {
    const col = ws.getColumn(i + 1);
    const longest = Math.max(
      [...h].length,
      ...table.rows.slice(0, 500).map((r) => [...String(r[i] ?? "")].length),
    );
    col.width = Math.min(40, Math.max(8, longest * 1.6 + 2));
    const fmt = table.numberFormats?.[i];
    if (fmt) col.numFmt = fmt;
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: table.headers.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** 書き出し（形式ごとにバイト列を返す） */
export async function renderExport(table: ExportTable, format: ExportFormat): Promise<Buffer> {
  if (format === "xlsx") return buildXlsx(table);
  return encodeCsv(toCsv(table), format === "csv_sjis" ? "sjis" : "utf8");
}

/** 分 → 時間（小数2桁）。給与計算でそのまま使える形 */
export const toHours = (minutes: number | null | undefined) => Math.round(((minutes ?? 0) / 60) * 100) / 100;
