/**
 * CSV 出力。Excel での数式インジェクションを防ぐため、= + - @ タブ 改行で始まる値は先頭に ' を付ける。
 */
const DANGEROUS_START = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (DANGEROUS_START.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCsvCell).join(","), ...rows.map((r) => r.map(escapeCsvCell).join(","))];
  // Excel で文字化けしないよう UTF-8 BOM を付与
  return "﻿" + lines.join("\r\n") + "\r\n";
}
