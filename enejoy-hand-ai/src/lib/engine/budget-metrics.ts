import { jstMonthKey } from "@/lib/time";
import type { BudgetCell, CompanyData } from "@/lib/types";
import { TENANT } from "@/tenant";
import { monthsBetween } from "./metrics";

/**
 * 院別・月別の売上予算の計算（保存データから算出する。通信はしない）。
 * 予算を決めていない院・月は「基準額（1院あたりの月平均）」で計算し、開院前の月は 0 とする。
 */

export const fiscalMonths = () => monthsBetween(TENANT.revenueTarget.fromMonth, TENANT.revenueTarget.toMonth);

export function isClinicOpen(clinicId: string, month: string): boolean {
  const c = TENANT.clinics.find((x) => x.id === clinicId);
  return Boolean(c) && (!c!.openedMonth || month >= c!.openedMonth);
}

/** 開いている院・月の数（予算を割り当てる枠の数） */
export function openClinicMonths(): number {
  return fiscalMonths().reduce((n, m) => n + TENANT.clinics.filter((c) => isClinicOpen(c.id, m)).length, 0);
}

export type BudgetSource = { standardJpy: number; cells: BudgetCell[] };

export function cellAmount(src: BudgetSource, month: string, clinicId: string): number {
  if (!isClinicOpen(clinicId, month)) return 0;
  return src.cells.find((c) => c.month === month && c.clinicId === clinicId)?.amountJpy ?? src.standardJpy;
}

/** 基準額ですべての院・月を埋めた予算 */
export function standardCells(standardJpy: number): BudgetCell[] {
  return fiscalMonths().flatMap((month) =>
    TENANT.clinics.filter((c) => isClinicOpen(c.id, month)).map((c) => ({ month, clinicId: c.id, amountJpy: standardJpy })),
  );
}

/** 確定した予算（なければ基準額） */
export function confirmedSource(data: Pick<CompanyData, "budget">): BudgetSource {
  return data.budget.confirmed ?? { standardJpy: TENANT.budget.standardPerClinicJpy, cells: [] };
}

/** 案（なければ確定した予算） */
export function draftSource(data: Pick<CompanyData, "budget">): BudgetSource {
  return data.budget.draft ?? confirmedSource(data);
}

/**
 * 予算の表：院×月の予算と、実績・着地予想・達成率。
 * 達成率は、過ぎた月は実績÷予算、今月は着地予想÷予算（着地予想がなければ実績）。
 */
export function budgetTable(data: Pick<CompanyData, "budget" | "clinicMonths">, now: Date, which: "confirmed" | "draft" = "confirmed") {
  const src = which === "draft" ? draftSource(data) : confirmedSource(data);
  const months = fiscalMonths();
  const current = jstMonthKey(now);
  const target = TENANT.revenueTarget.amountJpy;
  const status = (m: string) => (m < current ? "past" : m === current ? "current" : "future") as "past" | "current" | "future";

  const rows = TENANT.clinics.map((c) => {
    const cells = months.map((month) => {
      const budget = cellAmount(src, month, c.id);
      const v = data.clinicMonths.find((r) => r.month === month && r.clinicId === c.id)?.values;
      const st = status(month);
      const actual = st === "future" ? null : (v?.salesActual ?? null);
      const forecast = st === "past" ? actual : st === "current" ? (v?.salesForecast ?? actual) : null;
      const basis = st === "past" ? actual : forecast;
      return {
        month,
        status: st,
        open: isClinicOpen(c.id, month),
        budget,
        actual,
        forecast,
        rate: budget > 0 && basis != null ? Math.round((basis / budget) * 1000) / 10 : null,
      };
    });
    const open = cells.filter((x) => x.open);
    // 実績（今月は着地予想）がある月だけで比べる。数字を取り込んでいない月は含めない
    const toDate = cells.filter((x) => x.status !== "future" && x.forecast != null);
    return {
      clinicId: c.id,
      name: c.name,
      short: c.short,
      cells,
      totalBudget: cells.reduce((n, x) => n + x.budget, 0),
      averageBudget: open.length ? Math.round(open.reduce((n, x) => n + x.budget, 0) / open.length) : 0,
      /** 実績がある月の予算の合計 */
      budgetToDate: toDate.reduce((n, x) => n + x.budget, 0),
      /** 過ぎた月の実績＋今月の着地予想 */
      landingToDate: toDate.reduce((n, x) => n + (x.forecast ?? 0), 0),
      /** 年間の着地見込み：過ぎた月の実績＋今月の着地予想＋これからの月の予算 */
      landingYear: cells.reduce((n, x) => n + (x.status === "future" ? x.budget : (x.forecast ?? 0)), 0),
    };
  });

  const monthTotals = months.map((month, i) => {
    const xs = rows.map((r) => r.cells[i]);
    const withBasis = xs.filter((x) => x.rate != null);
    const budget = xs.reduce((n, x) => n + x.budget, 0);
    const basis = withBasis.reduce((n, x) => n + ((x.status === "past" ? x.actual : x.forecast) ?? 0), 0);
    const basisBudget = withBasis.reduce((n, x) => n + x.budget, 0);
    return { month, status: status(month), budget, rate: basisBudget ? Math.round((basis / basisBudget) * 1000) / 10 : null };
  });

  const slots = openClinicMonths();
  const totalBudget = rows.reduce((n, r) => n + r.totalBudget, 0);
  const budgetToDate = rows.reduce((n, r) => n + r.budgetToDate, 0);
  const landingToDate = rows.reduce((n, r) => n + r.landingToDate, 0);
  return {
    which,
    standardJpy: src.standardJpy,
    confirmed: data.budget.confirmed ? { at: data.budget.confirmed.confirmedAt, approvalId: data.budget.confirmed.approvalId } : null,
    months,
    currentMonth: current,
    rows,
    monthTotals,
    targetJpy: target,
    totalBudget,
    /** 予算が3億円に足りない額（マイナスなら上回っている） */
    gapToTarget: target - totalBudget,
    clinicMonthSlots: slots,
    /** 院・月あたりの予算の平均 */
    averagePerClinicMonth: slots ? Math.round(totalBudget / slots) : 0,
    /** 3億円に届くために必要な院・月あたりの平均 */
    requiredAverageForTarget: slots ? Math.ceil(target / slots / 10_000) * 10_000 : 0,
    budgetToDate,
    landingToDate,
    rateToDate: budgetToDate ? Math.round((landingToDate / budgetToDate) * 1000) / 10 : null,
    landingYear: rows.reduce((n, r) => n + r.landingYear, 0),
  };
}

export type BudgetTable = ReturnType<typeof budgetTable>;
