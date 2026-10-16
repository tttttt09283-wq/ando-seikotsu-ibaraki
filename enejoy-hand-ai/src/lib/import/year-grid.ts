import { clinicOpenIn } from "@/lib/clinics";
import type { Clinic } from "@/lib/tenant-types";
import { FACTOR, guessUnit, type BudgetUnit } from "./budget";
import { matchClinic } from "./daily-report";
import { normalizeLabel, parseNumberCell } from "./normalize";

/**
 * 院×月の「予算・実績・昨対」の表を読み取る（年間予算表・進捗売上実績の「院」タブなど）。
 *
 * 読み取れる形：
 * - 「7月」「8月」…の見出し行があり、その下に院ごとのまとまりがある
 * - 行の左側に年度（例「R8.7~R9.6」「2026.7~2027.6」）があれば、その年度の数字。
 *   今期より前の年度は実績、今期以降は予算（計画）として扱う
 * - 行の左側が「予算」「計画」なら予算、「実績」なら実績、「昨対」「昨年」なら前年度の実績
 * - 「達成率」「昨対比」など % の行は読まない
 * - 院の予算の下にある、見出しのない小さな数字（4、4.5 など）の行は施術者の人数
 * - 「既存店成長率」の右にある数字（1.05 など）は成長率
 */

export type YearCell = { month: string; clinicId: string; amountJpy: number };
export type YearGridResult = {
  /** 今期以降の予算・計画（年度の期首ごと） */
  budgets: { fyStart: string; cells: YearCell[]; staff: { month: string; clinicId: string; staff: number }[]; companyTotal?: number }[];
  /** 実績（前年度の実績・今期の実績） */
  actuals: YearCell[];
  growthRate?: number;
  unitUsed: Exclude<BudgetUnit, "auto">;
  unmatched: string[];
  warnings: string[];
  /** この形式の表として読めたか（読めなければ別の読み方を試す） */
  recognized: boolean;
};

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 「R8.7~R9.6」「令和8年7月〜」「2026.7~」「2026年7月〜」→ 期首 YYYY-MM */
export function parsePeriodStart(text: string): string | null {
  const s = text.normalize("NFKC").replace(/\s/g, "");
  let m = /^(?:r|R|令和)(\d{1,2})[.年/](\d{1,2})月?[~〜～\-ー－]/.exec(s);
  if (m) return `${2018 + Number(m[1])}-${String(Number(m[2])).padStart(2, "0")}`;
  m = /^(20\d{2})[.年/](\d{1,2})月?[~〜～\-ー－]/.exec(s);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;
  return null;
}

const SKIP_ROW = /(達成率|比$|昨対比|前年比|伸び率|差額?$|構成比)/;
const PRIOR_ROW = /(昨対|昨年|前年)/;
const ACTUAL_ROW = /実績/;
const BUDGET_ROW = /(予算|計画|目標|理想|現実)/;
const TOTAL_ROW = /^(合計|総計|全院|全体|計|小計|本部|調整|\d+店舗)/;

export function parseClinicYearGrid(
  grid: string[][],
  opts: { clinics: Clinic[]; currentFyStart: string; unit?: BudgetUnit },
): YearGridResult {
  const warnings: string[] = [];
  const unmatched: string[] = [];
  const empty = (msg: string): YearGridResult => ({ budgets: [], actuals: [], unitUsed: "yen", unmatched: [], warnings: [msg], recognized: false });

  // 見出し行（「7月」…が6つ以上）
  let headerIdx = -1;
  let monthCols: { col: number; m: number }[] = [];
  for (let r = 0; r < Math.min(grid.length, 40); r++) {
    const cols = grid[r].map((c, col) => ({ col, mm: /^(\d{1,2})月$/.exec(normalizeLabel(c ?? "")) })).filter((x) => x.mm);
    if (cols.length >= 6) {
      headerIdx = r;
      monthCols = cols.map(({ col, mm }) => ({ col, m: Number(mm![1]) }));
      break;
    }
  }
  if (headerIdx < 0) return empty("「7月」「8月」…の月の見出し行が見つかりませんでした。");
  const firstCol = monthCols[0].col;
  const fyStartMonth = Number(opts.currentFyStart.slice(5));
  const monthOf = (fyStart: string, m: number) => addMonths(fyStart, (m - fyStartMonth + 12) % 12);
  const prevFy = (fy: string) => addMonths(fy, -12);

  // 成長率（「既存店成長率」の右の数字）
  let growthRate: number | undefined;
  for (const row of grid) {
    const i = row.findIndex((c) => /成長率/.test(normalizeLabel(c ?? "")));
    if (i < 0) continue;
    const v = row.slice(i + 1).map((c) => parseNumberCell(c)).find((x) => x !== undefined);
    if (v !== undefined) growthRate = v > 3 ? v / 100 : v;
    break;
  }

  type Raw = { kind: "budget" | "actual" | "staff"; fy: string; clinicId: string; values: (number | undefined)[]; annual?: number; label: string };
  const raws: Raw[] = [];
  const companyTotals = new Map<string, number>();
  let clinic: Clinic | undefined;
  let inTotal = true; // 最初の院より上は全体の行
  let blockBudgetFy = null as string | null;
  let lastFy = null as string | null;
  let recognized = false;

  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    const labels = row.slice(0, firstCol).map((c) => (c ?? "").trim()).filter(Boolean);
    const cellsRaw = monthCols.map(({ col }) => (row[col] ?? "").trim());
    const values = cellsRaw.map((c) => (c.includes("%") ? undefined : parseNumberCell(c)));
    const count = values.filter((v) => v !== undefined).length;
    const percentRow = cellsRaw.filter((c) => c.includes("%")).length > cellsRaw.filter(Boolean).length / 2;

    const c = labels.map((l) => matchClinic(l, opts.clinics)).find(Boolean);
    if (c && c.id !== clinic?.id) {
      clinic = c;
      inTotal = false;
      blockBudgetFy = null;
      lastFy = null;
    } else if (!c && labels.some((l) => TOTAL_ROW.test(normalizeLabel(l)))) {
      clinic = undefined;
      inTotal = true;
    }
    // 院名と、年間合計・差額などの数字のセルを除いた見出し
    const otherLabels = labels.filter((l) => !matchClinic(l, opts.clinics) && parseNumberCell(l) === undefined);
    const period = otherLabels.map(parsePeriodStart).find(Boolean) ?? null;
    const text = normalizeLabel(otherLabels.join(" "));
    if (percentRow || (text && SKIP_ROW.test(text) && !period)) continue;
    if (count === 0) continue;

    // 年度でも「予算」「実績」などでもない見出し ＝ 院の名前。院として分からなければ、次の院までの行は読まない
    const name = c
      ? undefined
      : otherLabels.find((l) => !parsePeriodStart(l) && !BUDGET_ROW.test(l) && !ACTUAL_ROW.test(l) && !PRIOR_ROW.test(l) && !SKIP_ROW.test(normalizeLabel(l)));
    if (name && !TOTAL_ROW.test(normalizeLabel(name))) {
      if (!unmatched.includes(name)) unmatched.push(name);
      clinic = undefined;
      inTotal = false;
      continue;
    }
    if (!c && !clinic && !inTotal) continue;

    let kind: Raw["kind"] | null = null;
    let fy: string | null = null;
    if (period) {
      fy = period;
      kind = period < opts.currentFyStart ? "actual" : "budget";
    } else if (PRIOR_ROW.test(text)) {
      kind = "actual";
      fy = prevFy(lastFy ?? opts.currentFyStart);
    } else if (ACTUAL_ROW.test(text)) {
      kind = "actual";
      fy = lastFy ?? opts.currentFyStart;
    } else if (BUDGET_ROW.test(text)) {
      kind = "budget";
      fy = lastFy && lastFy >= opts.currentFyStart ? lastFy : opts.currentFyStart;
    } else if (!text && clinic && blockBudgetFy && count >= 6 && values.every((v) => v === undefined || (v >= 0 && v <= 50))) {
      kind = "staff";
      fy = blockBudgetFy;
    }
    if (!kind || !fy) continue;
    recognized = true;
    if (kind === "budget") {
      lastFy = fy;
      blockBudgetFy ??= fy;
    }
    const annualCell = parseNumberCell(row[firstCol - 1]);
    if (inTotal || !clinic) {
      if (kind === "budget" && annualCell !== undefined && !companyTotals.has(fy)) companyTotals.set(fy, annualCell);
      continue;
    }
    raws.push({ kind, fy, clinicId: clinic.id, values, annual: annualCell, label: otherLabels.join(" ") });
  }

  if (!recognized) {
    return { ...empty("年度（R8.7~R9.6 など）や「予算」「実績」の行が見つかりませんでした。"), unmatched };
  }

  const money = raws.filter((x) => x.kind !== "staff");
  const unit = opts.unit && opts.unit !== "auto" ? opts.unit : guessUnit(money.flatMap((x) => x.values.filter((v): v is number => v !== undefined)));
  const factor = FACTOR[unit];
  const clinicById = new Map(opts.clinics.map((c) => [c.id, c]));

  const budgets = new Map<string, NonNullable<YearGridResult["budgets"]>[number]>();
  const seenBudget = new Set<string>();
  const actualKey = new Set<string>();
  const actuals: YearCell[] = [];
  let dupWarned = false;
  for (const x of raws) {
    const cl = clinicById.get(x.clinicId)!;
    const months = monthCols.map(({ m }) => monthOf(x.fy, m));
    if (x.kind === "staff") {
      const b = budgets.get(x.fy);
      if (!b) continue;
      x.values.forEach((v, i) => {
        if (v !== undefined && clinicOpenIn(cl, months[i])) b.staff.push({ month: months[i], clinicId: x.clinicId, staff: v });
      });
      continue;
    }
    if (x.kind === "budget") {
      const k = `${x.fy}|${x.clinicId}`;
      if (seenBudget.has(k)) {
        if (!dupWarned) warnings.push(`${cl.name}などに同じ年度の予算が2行（理想値・現実など）あります。上の行を使いました。`);
        dupWarned = true;
        continue;
      }
      seenBudget.add(k);
      if (!budgets.has(x.fy)) budgets.set(x.fy, { fyStart: x.fy, cells: [], staff: [] });
      const b = budgets.get(x.fy)!;
      let sum = 0;
      x.values.forEach((v, i) => {
        if (v === undefined) return;
        sum += v;
        if (clinicOpenIn(cl, months[i])) b.cells.push({ month: months[i], clinicId: x.clinicId, amountJpy: Math.round(v * factor) });
      });
      if (x.annual !== undefined && Math.abs(x.annual - sum) > Math.max(1, x.annual * 0.001)) {
        warnings.push(`${cl.name}（${x.fy.slice(0, 4)}年度）の年間合計 ${x.annual.toLocaleString("ja-JP")} と、月の合計 ${sum.toLocaleString("ja-JP")} が合いません。月の数字を使いました。`);
      }
      continue;
    }
    x.values.forEach((v, i) => {
      if (v === undefined || v === 0) return;
      const k = `${months[i]}|${x.clinicId}`;
      if (actualKey.has(k)) return;
      actualKey.add(k);
      actuals.push({ month: months[i], clinicId: x.clinicId, amountJpy: Math.round(v * factor) });
    });
  }
  for (const [fy, total] of companyTotals) {
    const b = budgets.get(fy);
    if (!b) continue;
    b.companyTotal = Math.round(total * factor);
    const sum = b.cells.reduce((n, c) => n + c.amountJpy, 0);
    if (Math.abs(sum - b.companyTotal) > Math.max(1000, b.companyTotal * 0.001)) {
      warnings.push(`${fy.slice(0, 4)}年度：表の全体の予算 ${b.companyTotal.toLocaleString("ja-JP")}円 と、院の合計 ${sum.toLocaleString("ja-JP")}円 が合いません（読み取れなかった院がないか確認してください）。`);
    }
  }
  return {
    budgets: [...budgets.values()].sort((a, b) => a.fyStart.localeCompare(b.fyStart)),
    actuals,
    growthRate,
    unitUsed: unit,
    unmatched,
    warnings,
    recognized: true,
  };
}
