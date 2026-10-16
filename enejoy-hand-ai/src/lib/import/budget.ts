import { clinicOpenIn } from "@/lib/clinics";
import type { Clinic } from "@/lib/tenant-types";
import { parseBusinessPlan } from "./business-plan";
import { matchClinic } from "./daily-report";
import { normalizeLabel, parseNumberCell } from "./normalize";

export type BudgetUnit = "auto" | "yen" | "thousand" | "man";
const FACTOR: Record<Exclude<BudgetUnit, "auto">, number> = { yen: 1, thousand: 1_000, man: 10_000 };
export const UNIT_LABEL: Record<Exclude<BudgetUnit, "auto">, string> = { yen: "円", thousand: "千円", man: "万円" };

export type BudgetImportResult = {
  cells: { month: string; clinicId: string; amountJpy: number }[];
  /** 年間合計だけの表を、営業している月に均等に割り振ったか */
  annualOnly: boolean;
  unitUsed: Exclude<BudgetUnit, "auto">;
  /** 院として認識できなかった行（新しい院なら、院を追加してから取り込み直す） */
  unmatched: string[];
  warnings: string[];
};

const TOTAL_ROW = /^(合計|総計|全院|全体|計|小計|本部|調整)/;

/** 1院・1か月あたりの金額の大きさから単位を推定する（例：350万円 → 3,500,000／3,500／350） */
function guessUnit(monthlyValues: number[]): Exclude<BudgetUnit, "auto"> {
  const xs = monthlyValues.filter((v) => v > 0).sort((a, b) => a - b);
  if (!xs.length) return "yen";
  const median = xs[Math.floor(xs.length / 2)];
  return median >= 100_000 ? "yen" : median >= 1_000 ? "thousand" : "man";
}

/**
 * 予算表を読み取る。
 * 1. 「7月」「8月」…の見出しがあれば、院×月の予算として読む
 * 2. なければ「年間」「予算」「合計」などの列から院ごとの年間予算を読み、営業している月に均等に割り振る
 */
export function parseBudgetGrid(
  grid: string[][],
  opts: { clinics: Clinic[]; fromMonth: string; months: string[]; unit: BudgetUnit },
): BudgetImportResult {
  const warnings: string[] = [];
  const unmatched: string[] = [];
  const monthly = parseBusinessPlan(grid, { clinics: opts.clinics, fromMonth: opts.fromMonth });
  const inYear = new Set(opts.months);

  if (monthly.months.length >= 3) {
    const rows = monthly.records.filter((r) => inYear.has(r.month));
    for (const label of new Set(rows.filter((r) => !r.clinicId).map((r) => r.label))) {
      if (!TOTAL_ROW.test(normalizeLabel(label))) unmatched.push(label);
    }
    const clinicRows = rows.filter((r) => r.clinicId);
    const unit = opts.unit === "auto" ? guessUnit(clinicRows.map((r) => r.amountJpy)) : opts.unit;
    const cells = clinicRows
      .filter((r) => {
        const c = opts.clinics.find((x) => x.id === r.clinicId)!;
        return clinicOpenIn(c, r.month);
      })
      .map((r) => ({ month: r.month, clinicId: r.clinicId!, amountJpy: Math.round(r.amountJpy * FACTOR[unit]) }));
    const skipped = clinicRows.length - cells.length;
    if (skipped > 0) warnings.push(`開院前・閉院後の月の ${skipped}件は取り込みませんでした。`);
    return { cells, annualOnly: false, unitUsed: unit, unmatched, warnings: [...monthly.warnings, ...warnings] };
  }

  // 年間合計の表
  let headerIdx = -1;
  let valueCol = -1;
  for (let r = 0; r < Math.min(grid.length, 30) && headerIdx < 0; r++) {
    grid[r].forEach((cell, col) => {
      if (valueCol < 0 && /(年間|予算|合計|計画|目標)/.test(normalizeLabel(cell))) {
        headerIdx = r;
        valueCol = col;
      }
    });
  }
  if (headerIdx < 0) {
    return { cells: [], annualOnly: false, unitUsed: "yen", unmatched: [], warnings: ["「7月」「8月」…の見出しか、「年間」「予算」などの列が見つかりませんでした。"] };
  }
  const annual: { clinicId: string; value: number; openMonths: string[] }[] = [];
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    const label = row.slice(0, valueCol).find((c) => c.trim())?.trim() ?? "";
    const value = parseNumberCell(row[valueCol]);
    if (!label || value === undefined) continue;
    const c = matchClinic(label, opts.clinics);
    if (!c) {
      if (!TOTAL_ROW.test(normalizeLabel(label))) unmatched.push(label);
      continue;
    }
    if (annual.some((a) => a.clinicId === c.id)) continue;
    const openMonths = opts.months.filter((m) => clinicOpenIn(c, m));
    if (!openMonths.length) {
      warnings.push(`${c.name}は今年度の営業月がないため取り込みませんでした。`);
      continue;
    }
    annual.push({ clinicId: c.id, value, openMonths });
  }
  const unit = opts.unit === "auto" ? guessUnit(annual.map((a) => a.value / a.openMonths.length)) : opts.unit;
  const cells = annual.flatMap(({ clinicId, value, openMonths }) => {
    const total = Math.round(value * FACTOR[unit]);
    const each = Math.floor(total / openMonths.length);
    return openMonths.map((month, i) => ({
      month,
      clinicId,
      // 端数は最後の月に寄せて、年間の合計を元の数字とそろえる
      amountJpy: i === openMonths.length - 1 ? total - each * (openMonths.length - 1) : each,
    }));
  });
  if (annual.length) warnings.push("年間の予算を、営業している月に均等に割り振りました。月ごとの調整は編集で行ってください。");
  return { cells, annualOnly: true, unitUsed: unit, unmatched, warnings };
}
