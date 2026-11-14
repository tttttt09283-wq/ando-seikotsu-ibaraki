// RFC 4180 準拠の CSV 読み書き（引用符・改行入りセル・BOM・CRLF に対応）

export function parseCSV(text: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // 末尾の空行を除く
  while (rows.length && rows[rows.length - 1].every((c) => c.trim() === "")) rows.pop();
  return rows;
}

function esc(v: unknown): string {
  if (v == null) return "";
  let s = String(v);
  // 表計算ソフトでの数式実行（CSV インジェクション）を防ぐ
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Excel で文字化けしないよう BOM 付き UTF-8 */
export function toCSV(rows: unknown[][]): string {
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

/** 先頭・末尾の空行／空列を除いた矩形にする */
export function trimGrid(rows: string[][]): string[][] {
  const norm = rows.map((r) => r.map((c) => (c ?? "").toString().trim()));
  let top = 0;
  while (top < norm.length && norm[top].every((c) => c === "")) top++;
  let bottom = norm.length - 1;
  while (bottom >= top && norm[bottom].every((c) => c === "")) bottom--;
  const body = norm.slice(top, bottom + 1);
  const width = Math.max(0, ...body.map((r) => r.length));
  let left = 0;
  while (left < width && body.every((r) => (r[left] ?? "") === "")) left++;
  let right = width - 1;
  while (right >= left && body.every((r) => (r[right] ?? "") === "")) right--;
  return body.map((r) => Array.from({ length: right - left + 1 }, (_, i) => r[left + i] ?? ""));
}
