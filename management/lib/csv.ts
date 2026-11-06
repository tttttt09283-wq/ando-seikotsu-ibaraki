// CSV の読み込み（RFC 4180：ダブルクォート・改行を含む値に対応）。Excel の Shift_JIS 保存にも対応

// バイト列 → 文字列。UTF-8（BOM付き可）で読めなければ Shift_JIS として読む
export function decodeCsvBytes(bytes: Uint8Array): { text: string; encoding: "utf-8" | "shift_jis" } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text: text.replace(/^﻿/, ""), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("shift_jis").decode(bytes), encoding: "shift_jis" };
  }
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  // 空行は除く
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

// 1行目を見出しとして、見出し名 → 値 のオブジェクトにする。見出しの前後の空白・全角空白は無視
export function rowsToRecords(rows: string[][]): { headers: string[]; records: { rowNo: number; values: Record<string, string> }[] } {
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map((h) => h.replace(/[\s　]/g, ""));
  const records = rows.slice(1).map((r, i) => ({
    rowNo: i + 2, // 見出しを1行目として、Excel と同じ行番号
    values: Object.fromEntries(headers.map((h, j) => [h, (r[j] ?? "").trim()])),
  }));
  return { headers, records };
}

// 全角数字・記号を半角に
export function toHalfWidth(s: string): string {
  return s.replace(/[０-９．／－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[ー−]/g, "-");
}

// 2026/4/1・2026-04-01・2026年4月1日 → "2026-04-01"（存在しない日付は null）
export function parseDate(input: string): string | null {
  const v = toHalfWidth(input.trim());
  const m = v.match(/^(\d{4})[/\-年.](\d{1,2})[/\-月.](\d{1,2})日?$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${m[1]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// "7.5"・"７．５"・"7.5日" → 7.5（数値でなければ null）
export function parseDays(input: string): number | null {
  const v = toHalfWidth(input.trim()).replace(/日$/, "");
  if (v === "") return null;
  if (!/^\d+(\.\d+)?$/.test(v)) return null;
  return Number(v);
}

// CSV の1セルを書く（ダウンロード用）
export function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
