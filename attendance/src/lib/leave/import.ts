/**
 * 有給残数の取込（Excel / CSV）の読み取りと検証。ファイル形式に依存しない部分（表 → 行データ）を担う。
 *
 * 1行 = 1回の付与。列名は表記ゆれを吸収する（例：「スタッフID」「社員番号」、「取得日数」「使用日数」）。
 *   必須：スタッフID、付与日、付与日数
 *   任意：取得済み日数（無ければ「残日数」から計算）、残日数（取得済み日数とあわせて突き合わせ）、有効期限、氏名、備考
 */

export type ImportField = "staff_code" | "name" | "grant_date" | "granted_days" | "taken_days" | "remaining_days" | "expiration_date" | "note";

const HEADER_ALIASES: Record<ImportField, string[]> = {
  staff_code: ["スタッフid", "スタッフコード", "スタッフ番号", "社員番号", "社員コード", "社員id", "従業員番号", "従業員コード", "id"],
  name: ["氏名", "名前", "スタッフ名", "社員名", "従業員名"],
  grant_date: ["付与日", "付与年月日", "付与日付"],
  granted_days: ["付与日数", "付与数", "付与"],
  taken_days: ["取得済み日数", "取得済日数", "取得日数", "使用日数", "消化日数", "取得済み", "取得済"],
  remaining_days: ["残日数", "残数", "残り日数", "残", "残有給"],
  expiration_date: ["有効期限", "期限", "失効日", "時効日"],
  note: ["備考", "メモ"],
};

export interface ImportRow {
  row: number; // 元のファイルの行番号（1始まり）
  staff_code: string;
  name: string | null;
  grant_date: string;
  granted_days: number;
  taken_days: number;
  expiration_date: string | null;
}

export interface ImportIssue {
  row: number;
  level: "error" | "warn";
  message: string;
}

export type Cell = string | number | boolean | Date | null | undefined;

const normalizeHeader = (value: Cell) =>
  String(value ?? "")
    .normalize("NFKC")
    .replace(/[\s　()（）]/g, "")
    .toLowerCase();

/** 見出し行を探し、列番号と項目の対応を返す（先頭10行まで） */
export function detectHeader(table: Cell[][]): { headerRow: number; columns: Partial<Record<ImportField, number>> } | null {
  for (let r = 0; r < Math.min(10, table.length); r++) {
    const columns: Partial<Record<ImportField, number>> = {};
    table[r].forEach((cell, c) => {
      const h = normalizeHeader(cell);
      if (!h) return;
      for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [ImportField, string[]][]) {
        if (columns[field] === undefined && aliases.includes(h)) {
          columns[field] = c;
          break;
        }
      }
    });
    if (columns.staff_code !== undefined && columns.grant_date !== undefined && columns.granted_days !== undefined) {
      return { headerRow: r, columns };
    }
  }
  return null;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

const ERA_BASE: Record<string, number> = { 令和: 2018, r: 2018, 平成: 1988, h: 1988 };

/** Excel の日付（Date・シリアル値）や「2025/10/1」「2025年10月1日」「令和7年10月1日」「R7.10.1」を YYYY-MM-DD に */
export function parseDateCell(value: Cell): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    // Excel の日付セルは時刻なしの UTC 0時として読み込まれる
    return validDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number") {
    if (value < 20000 || value > 80000) return null; // 1954〜2119年の範囲のシリアル値のみ
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return validDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  const s = String(value).normalize("NFKC").trim();
  let m = s.match(/^(\d{4})[/\-.年](\d{1,2})[/\-.月](\d{1,2})日?$/);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(令和|平成|[RrHh])\s*(\d{1,2}|元)[/\-.年](\d{1,2})[/\-.月](\d{1,2})日?$/);
  if (m) {
    const base = ERA_BASE[m[1].toLowerCase()] ?? ERA_BASE[m[1]];
    const year = m[2] === "元" ? 1 : Number(m[2]);
    return validDate(base + year, Number(m[3]), Number(m[4]));
  }
  return null;
}

/** 「10」「10日」「10.5」「１０」を数値に。空欄は null */
export function parseDaysCell(value: Cell): number | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  const s = String(value).normalize("NFKC").replace(/日$/, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : "invalid";
}

function parseStaffCode(value: Cell): { code: string; padded: boolean } | null {
  if (value === null || value === undefined || value === "") return null;
  let s = typeof value === "number" ? String(Math.trunc(value)) : String(value).normalize("NFKC").trim();
  let padded = false;
  if (/^\d{1,3}$/.test(s)) {
    // Excel で数値として保存され、先頭の 0 が消えた場合を補う
    s = s.padStart(4, "0");
    padded = true;
  }
  return /^\d{4,8}$/.test(s) ? { code: s, padded } : { code: s, padded: false };
}

const isHalfStep = (n: number) => Number.isInteger(n * 2);

/** 表（行×列）を取込データに変換する。エラーのある行は rows に含めない */
export function parseLeaveTable(table: Cell[][]): { rows: ImportRow[]; issues: ImportIssue[] } {
  const header = detectHeader(table);
  if (!header) {
    return {
      rows: [],
      issues: [{ row: 0, level: "error", message: "見出し行が見つかりません（「スタッフID」「付与日」「付与日数」の列が必要です）" }],
    };
  }
  const { headerRow, columns } = header;
  const rows: ImportRow[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Map<string, number>();
  const get = (r: Cell[], field: ImportField) => (columns[field] === undefined ? undefined : r[columns[field] as number]);

  for (let i = headerRow + 1; i < table.length; i++) {
    const r = table[i];
    const rowNo = i + 1;
    if (r.every((c) => c === null || c === undefined || String(c).trim() === "")) continue;
    const errors: string[] = [];

    const staff = parseStaffCode(get(r, "staff_code"));
    if (!staff) errors.push("スタッフIDが空欄です");
    else if (!/^\d{4,8}$/.test(staff.code)) errors.push(`スタッフID「${staff.code}」は4〜8桁の数字ではありません`);
    else if (staff.padded) issues.push({ row: rowNo, level: "warn", message: `スタッフIDを「${staff.code}」として読み込みました（先頭の0を補完）` });

    const grantDate = parseDateCell(get(r, "grant_date"));
    if (!grantDate) errors.push("付与日を日付として読み取れません");

    const granted = parseDaysCell(get(r, "granted_days"));
    if (granted === null || granted === "invalid" || granted <= 0 || granted > 40 || !isHalfStep(granted)) {
      errors.push("付与日数は0.5日単位の数値で入力してください");
    }

    const takenCell = parseDaysCell(get(r, "taken_days"));
    const remainingCell = parseDaysCell(get(r, "remaining_days"));
    let taken: number | null = null;
    if (takenCell === "invalid" || remainingCell === "invalid") {
      errors.push("取得済み日数・残日数は数値で入力してください");
    } else if (typeof granted === "number") {
      if (takenCell !== null) taken = takenCell;
      else if (remainingCell !== null) taken = granted - remainingCell;
      else taken = 0;
      if (takenCell !== null && remainingCell !== null && Math.abs(granted - takenCell - remainingCell) > 1e-9) {
        errors.push(`付与${granted}日 − 取得${takenCell}日 ≠ 残${remainingCell}日です`);
      }
      if (taken < 0 || taken > granted || !isHalfStep(taken)) errors.push("取得済み日数（または残日数）が付与日数と合いません");
    }

    const expRaw = get(r, "expiration_date");
    const expiration = expRaw === undefined || expRaw === null || expRaw === "" ? null : parseDateCell(expRaw);
    if (expRaw !== undefined && expRaw !== null && expRaw !== "" && !expiration) errors.push("有効期限を日付として読み取れません");
    if (expiration && grantDate && expiration <= grantDate) errors.push("有効期限は付与日より後にしてください");

    if (staff && grantDate) {
      const key = `${staff.code}|${grantDate}`;
      if (seen.has(key)) errors.push(`${seen.get(key)}行目と同じスタッフ・付与日です`);
      else seen.set(key, rowNo);
    }

    if (errors.length) {
      issues.push(...errors.map((message) => ({ row: rowNo, level: "error" as const, message })));
      continue;
    }
    const nameCell = get(r, "name");
    rows.push({
      row: rowNo,
      staff_code: (staff as { code: string }).code,
      name: nameCell ? String(nameCell).trim() : null,
      grant_date: grantDate as string,
      granted_days: granted as number,
      taken_days: taken as number,
      expiration_date: expiration,
    });
  }
  if (rows.length === 0 && !issues.some((x) => x.level === "error")) {
    issues.push({ row: 0, level: "error", message: "取り込めるデータ行がありません" });
  }
  return { rows, issues };
}

/** 取込用テンプレートの見出しと記入例 */
export const TEMPLATE_HEADERS = ["スタッフID", "氏名", "付与日", "付与日数", "取得済み日数", "残日数", "有効期限", "備考"];
export const TEMPLATE_EXAMPLE: Cell[] = ["1001", "安藤 太郎", "2025/10/01", 11, 3, 8, "2027/09/30", "残日数は省略可（取得済み日数から計算）"];
