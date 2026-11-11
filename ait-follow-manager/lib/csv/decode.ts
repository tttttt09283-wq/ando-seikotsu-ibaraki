import Papa from "papaparse";

export const CSV_MAX_BYTES = 5 * 1024 * 1024;
export const CSV_MAX_ROWS = 5000;

export class CsvFileError extends Error {}

/** UTF-8（BOM 有無）と Shift_JIS（Excel の既定保存形式）を判定してデコード */
export function decodeCsv(bytes: Uint8Array): string {
  if (bytes.byteLength === 0) throw new CsvFileError("ファイルが空です");
  if (bytes.byteLength > CSV_MAX_BYTES) throw new CsvFileError("ファイルサイズが上限（5MB）を超えています");
  if (bytes.includes(0)) throw new CsvFileError("CSV ではないファイルです（バイナリが含まれています）");

  let body = bytes;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) body = bytes.subarray(3);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    try {
      return new TextDecoder("shift_jis", { fatal: true }).decode(body);
    } catch {
      throw new CsvFileError("文字コードを判別できません（UTF-8 または Shift_JIS で保存してください）");
    }
  }
}

export type ParsedCsv = { headers: string[]; rows: Record<string, string>[] };

export function parseCsv(text: string): ParsedCsv {
  // papaparse は重複ヘッダーを自動で改名するため、生のヘッダー行で重複を確認する
  const rawHeader = (Papa.parse<string[]>(text, { preview: 1 }).data[0] ?? []).map((h) => h.trim().replace(/^\uFEFF/, ""));
  if (new Set(rawHeader).size !== rawHeader.length) throw new CsvFileError("ヘッダー名が重複しています");
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().replace(/^﻿/, ""),
    transform: (v) => v.trim(),
  });
  const headers = result.meta.fields ?? [];
  if (headers.length === 0) throw new CsvFileError("ヘッダー行がありません");
  if (new Set(headers).size !== headers.length) throw new CsvFileError("ヘッダー名が重複しています");
  if (result.data.length > CSV_MAX_ROWS) throw new CsvFileError(`行数が上限（${CSV_MAX_ROWS}行）を超えています`);
  const fatal = result.errors.find((e) => e.type === "Quotes");
  if (fatal) throw new CsvFileError(`CSV の形式が不正です（${(fatal.row ?? 0) + 2}行目付近の引用符）`);
  return { headers, rows: result.data };
}
