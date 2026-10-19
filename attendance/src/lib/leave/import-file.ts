import "server-only";
import ExcelJS from "exceljs";
import type { Cell } from "./import";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** exceljs のセル値（数式・リッチテキスト・ハイパーリンク等）を素の値にする */
function plainCell(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "object") {
    if ("result" in value) return plainCell(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("text" in value) return String(value.text);
    if ("error" in value) return null;
  }
  return String(value);
}

export interface SheetTable {
  name: string;
  table: Cell[][];
}

function sheetToTable(sheet: ExcelJS.Worksheet): Cell[][] {
  const table: Cell[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values = row.values as ExcelJS.CellValue[]; // values[0] は未使用（1始まり）
    table[rowNumber - 1] = values.slice(1).map(plainCell);
  });
  return Array.from(table, (r) => r ?? []);
}

/** 表示されていて、データのあるシート（ファイル内の順） */
async function readXlsxSheets(buffer: ArrayBuffer): Promise<SheetTable[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.worksheets
    .filter((ws) => ws.state === "visible" && ws.actualRowCount > 0)
    .map((ws) => ({ name: ws.name, table: sheetToTable(ws) }));
}

/** CSV（UTF-8 / Shift_JIS）。ダブルクォートで囲まれた値・改行を含む値に対応 */
function readCsv(buffer: ArrayBuffer): Cell[][] {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder("shift_jis").decode(buffer); // Excel で保存した日本語 CSV
  }
  text = text.replace(/^﻿/, "");
  const rows: Cell[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** アップロードされた Excel（.xlsx）・CSV をシートごとの表（行×列）として読み込む */
export async function readWorkbook(file: File): Promise<SheetTable[]> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error("ファイルが大きすぎます（5MBまで）");
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
    const sheets = await readXlsxSheets(buffer);
    if (sheets.length === 0) throw new Error("データのあるシートがありません");
    return sheets;
  }
  if (name.endsWith(".csv")) return [{ name: file.name, table: readCsv(buffer) }];
  if (name.endsWith(".xls")) throw new Error("古い形式（.xls）は読み込めません。Excel で「.xlsx」形式で保存し直してください");
  throw new Error("Excel（.xlsx）または CSV ファイルを選択してください（Google スプレッドシートは「ファイル → ダウンロード → Microsoft Excel」で保存）");
}

/** 最初のシートを表として読み込む */
export async function readSpreadsheet(file: File): Promise<Cell[][]> {
  return (await readWorkbook(file))[0].table;
}

/** 取込用テンプレート（.xlsx） */
export async function buildTemplate(headers: string[], example: Cell[]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("有給残数");
  sheet.addRow(headers);
  sheet.addRow(example);
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((col) => {
    col.width = 16;
  });
  sheet.getColumn(1).numFmt = "@"; // スタッフIDは先頭の0が消えないよう文字列
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}
