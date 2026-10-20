import { normalizeHeaderText, parseDaysCell, type Cell, type ImportIssue } from "./import";
import { addMonthsToDate, grantDateOf, HIRE_DATE_BASIS, statutoryDays, type GrantBasis, type WorkingConditions } from "./schedule";

/**
 * 「月末時点の有給残数」形式の取込（例：月ごとのシートに 氏名・出勤日数・有休・有給残 … が並ぶ出勤簿・残業代計算表）。
 * スタッフIDや付与日が無いため、氏名でスタッフを照合し、有給残（その月末の残日数）を取り込む。
 */

export interface SnapshotRow {
  row: number;
  name: string;
  /** 照合用（空白・括弧書きを除いた氏名） */
  nameKey: string;
  remaining_days: number;
}

/** 氏名の照合キー：全角/半角の違い・空白・末尾の括弧書き（例：「(個)」）を無視する */
export function nameKey(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[(（][^)）]*[)）]\s*$/, "")
    .replace(/[\s　]/g, "");
}

const REMAINING_HEADERS = ["有給残", "有給残日数", "有休残", "有休残日数", "残有給", "有給残数"];
const NAME_HEADERS = ["氏名", "名前", "スタッフ名", "社員名", "従業員名"];

/** 見出し行（「有給残」の列がある行）を探す。氏名の列は見出しが「氏名」等の列、無ければ先頭列 */
export function detectSnapshotHeader(table: Cell[][]): { headerRow: number; nameCol: number; remainingCol: number } | null {
  for (let r = 0; r < Math.min(10, table.length); r++) {
    const headers = table[r].map(normalizeHeaderText);
    const remainingCol = headers.findIndex((h) => REMAINING_HEADERS.includes(h));
    if (remainingCol < 0) continue;
    const nameCol = headers.findIndex((h) => NAME_HEADERS.includes(h));
    return { headerRow: r, nameCol: nameCol >= 0 ? nameCol : 0, remainingCol };
  }
  return null;
}

export function parseSnapshotTable(table: Cell[][]): { rows: SnapshotRow[]; issues: ImportIssue[] } {
  const header = detectSnapshotHeader(table);
  if (!header) return { rows: [], issues: [{ row: 0, level: "error", message: "「有給残」の列が見つかりません" }] };
  const rows: SnapshotRow[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Map<string, number>();
  for (let i = header.headerRow + 1; i < table.length; i++) {
    const r = table[i] ?? [];
    const rawName = r[header.nameCol];
    const name = rawName === null || rawName === undefined ? "" : String(rawName).trim();
    if (!name || typeof rawName === "number") continue; // 空行・集計行
    const remaining = parseDaysCell(r[header.remainingCol]);
    const rowNo = i + 1;
    if (remaining === null) {
      issues.push({ row: rowNo, level: "warn", message: `${name}：有給残が空欄のため対象外にしました` });
      continue;
    }
    if (remaining === "invalid" || remaining < 0 || remaining > 80 || !Number.isInteger(remaining * 2)) {
      issues.push({ row: rowNo, level: "error", message: `${name}：有給残「${String(r[header.remainingCol])}」は0.5日単位の数値ではありません` });
      continue;
    }
    const key = nameKey(name);
    if (seen.has(key)) {
      issues.push({ row: rowNo, level: "error", message: `${name}：${seen.get(key)}行目と同じ氏名です（同姓同名はスタッフID形式で取り込んでください）` });
      continue;
    }
    seen.set(key, rowNo);
    rows.push({ row: rowNo, name, nameKey: key, remaining_days: remaining });
  }
  if (rows.length === 0 && !issues.some((x) => x.level === "error")) {
    issues.push({ row: 0, level: "error", message: "取り込める行がありません" });
  }
  return { rows, issues };
}

/**
 * シート名・タイトルから対象月の末日を読み取る（例：「R8.6」「令和8年6月」「2026年6月」「2026.6」→ 2026-06-30）
 */
export function parseSheetMonthEnd(value: string): string | null {
  const s = value.normalize("NFKC").replace(/\s/g, "");
  let year: number | null = null;
  let month: number | null = null;
  let m = s.match(/(?:令和|R)(\d{1,2}|元)[.\-/年](\d{1,2})月?/i);
  if (m) {
    year = 2018 + (m[1] === "元" ? 1 : Number(m[1]));
    month = Number(m[2]);
  } else if ((m = s.match(/(20\d{2})[.\-/年](\d{1,2})月?/))) {
    year = Number(m[1]);
    month = Number(m[2]);
  }
  if (!year || !month || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** 月末残数形式のシートのうち、最新の月のもの */
export function latestMonthSheet(names: string[]): string | null {
  const dated = names.map((n) => ({ n, d: parseSheetMonthEnd(n) })).filter((x) => x.d !== null) as { n: string; d: string }[];
  if (dated.length === 0) return null;
  return dated.sort((a, b) => b.d.localeCompare(a.d))[0].n;
}

export interface PlannedMigrationGrant {
  grant_date: string;
  days: number;
  expiration_date: string;
}

const dayBefore = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/**
 * 付与日が分からない残数を、入社日（基準日方式の場合は基準日）から推定した法定の付与に振り分ける。
 * 残数は「直近の付与」から優先して埋め、超える分を「その前の付与」（まだ有効なもの）に割り当てる。
 * 例：入社 2024-04-01、2026-06-30 時点の残 18日 → 2025-10-01付与 11日 ＋ 2024-10-01付与 7日（2026-09-30 失効）
 */
export function planSnapshotGrants(
  hireDate: string,
  conditions: WorkingConditions,
  asOf: string,
  remaining: number,
  basis: GrantBasis = HIRE_DATE_BASIS,
): { grants: PlannedMigrationGrant[]; warning: string | null } {
  if (remaining <= 0) return { grants: [], warning: null };
  const scheduled: { date: string; days: number }[] = [];
  for (let i = 0; i < 60; i++) {
    const date = grantDateOf(hireDate, i, basis);
    if (date > asOf) break;
    scheduled.push({ date, days: statutoryDays(i, conditions).days });
  }
  const expiration = (date: string) => dayBefore(addMonthsToDate(date, 24));
  if (scheduled.length === 0) {
    return {
      grants: [{ grant_date: asOf, days: remaining, expiration_date: expiration(asOf) }],
      warning: "入社6か月前のため付与日を推定できません（取込日を付与日として登録）",
    };
  }
  const last = scheduled[scheduled.length - 1];
  const prev = scheduled.length >= 2 ? scheduled[scheduled.length - 2] : null;
  const prevValid = prev && expiration(prev.date) >= asOf ? prev : null;

  let fromLast = Math.min(remaining, last.days);
  const fromPrev = prevValid ? Math.min(remaining - fromLast, prevValid.days) : 0;
  const excess = remaining - fromLast - fromPrev;
  fromLast += excess;

  const grants: PlannedMigrationGrant[] = [];
  if (fromPrev > 0 && prevValid) grants.push({ grant_date: prevValid.date, days: fromPrev, expiration_date: expiration(prevValid.date) });
  grants.push({ grant_date: last.date, days: fromLast, expiration_date: expiration(last.date) });
  return { grants, warning: excess > 0 ? `法定の付与日数を超える残数（${excess}日）は直近の付与に含めました` : null };
}
