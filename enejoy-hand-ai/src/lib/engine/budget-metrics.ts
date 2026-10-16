import { clinicOpenIn, getClinics } from "@/lib/clinics";
import type { Clinic } from "@/lib/tenant-types";
import { jstMonthKey } from "@/lib/time";
import type { BudgetCell, CompanyData } from "@/lib/types";
import { TENANT } from "@/tenant";
import { monthsBetween } from "./metrics";

/**
 * 院別・月別の売上予算の計算（保存データから算出する。通信はしない）。
 * 予算を決めていない院・月は「基準額（1院あたりの月平均）」で計算し、開院前・閉院後の月は 0 とする。
 * 院の一覧は getClinics（設定の院＋画面で追加した院）を使うので、店舗展開・閉院にも追随する。
 */

export const fiscalMonths = () => monthsBetween(TENANT.revenueTarget.fromMonth, TENANT.revenueTarget.toMonth);

type BudgetData = Pick<CompanyData, "budget" | "clinicSetup">;

export function isClinicOpen(clinics: Clinic[], clinicId: string, month: string): boolean {
  const c = clinics.find((x) => x.id === clinicId);
  return Boolean(c) && clinicOpenIn(c!, month);
}

/** 営業している院・月の数（予算を割り当てる枠の数） */
export function openClinicMonths(clinics: Clinic[]): number {
  return fiscalMonths().reduce((n, m) => n + clinics.filter((c) => clinicOpenIn(c, m)).length, 0);
}

export type BudgetSource = { standardJpy: number; perStaffJpy: number; cells: BudgetCell[] };

export function cellOf(src: BudgetSource, clinics: Clinic[], month: string, clinicId: string): { amountJpy: number; staff?: number } {
  if (!isClinicOpen(clinics, clinicId, month)) return { amountJpy: 0 };
  const c = src.cells.find((x) => x.month === month && x.clinicId === clinicId);
  return { amountJpy: c?.amountJpy ?? src.standardJpy, staff: c?.staff };
}

/** 基準額で、営業しているすべての院・月を埋めた予算 */
export function standardCells(clinics: Clinic[], standardJpy: number): BudgetCell[] {
  return fiscalMonths().flatMap((month) =>
    clinics.filter((c) => clinicOpenIn(c, month)).map((c) => ({ month, clinicId: c.id, amountJpy: standardJpy })),
  );
}

const defaultSource = (): BudgetSource => ({
  standardJpy: TENANT.budget.standardPerClinicJpy,
  perStaffJpy: TENANT.budget.perStaffJpy,
  cells: [],
});

/** 確定した予算（なければ基準額） */
export function confirmedSource(data: Pick<CompanyData, "budget">): BudgetSource {
  const c = data.budget.confirmed;
  return c ? { standardJpy: c.standardJpy, perStaffJpy: c.perStaffJpy ?? TENANT.budget.perStaffJpy, cells: c.cells } : defaultSource();
}

/** 案（なければ確定した予算） */
export function draftSource(data: Pick<CompanyData, "budget">): BudgetSource {
  const d = data.budget.draft;
  return d ? { standardJpy: d.standardJpy, perStaffJpy: d.perStaffJpy ?? TENANT.budget.perStaffJpy, cells: d.cells } : confirmedSource(data);
}

/** 次に確定するときの版の名前（当初予算 → 修正予算① → 修正予算②…） */
export function nextVersionLabel(data: Pick<CompanyData, "budget">): string {
  const n = data.budget.history?.length ?? 0;
  if (n === 0) return "当初予算";
  const circled = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
  return `修正予算${circled[n - 1] ?? `(${n})`}`;
}

/**
 * 予算の表：院×月の予算・人員と、実績・着地予想・達成率。
 * 達成率は、過ぎた月は実績÷予算、今月は着地予想÷予算（着地予想がなければ実績）。
 * which = "confirmed"（今の確定予算）/ "draft"（案）/ 数字（確定した版の番号。0 が当初予算）
 */
export function budgetTable(data: BudgetData & Pick<CompanyData, "clinicMonths">, now: Date, which: "confirmed" | "draft" | number = "confirmed") {
  const clinics = getClinics(data);
  const history = data.budget.history ?? [];
  const version = typeof which === "number" ? history[which] : undefined;
  const src: BudgetSource =
    typeof which === "number"
      ? version
        ? { standardJpy: version.standardJpy, perStaffJpy: version.perStaffJpy, cells: version.cells }
        : defaultSource()
      : which === "draft"
        ? draftSource(data)
        : confirmedSource(data);
  const original = history[0] ? { standardJpy: history[0].standardJpy, perStaffJpy: history[0].perStaffJpy, cells: history[0].cells } : null;
  const months = fiscalMonths();
  const current = jstMonthKey(now);
  const target = TENANT.revenueTarget.amountJpy;
  const status = (m: string) => (m < current ? "past" : m === current ? "current" : "future") as "past" | "current" | "future";

  const rows = clinics.map((c) => {
    const cells = months.map((month) => {
      const { amountJpy: budget, staff } = cellOf(src, clinics, month, c.id);
      const v = data.clinicMonths.find((r) => r.month === month && r.clinicId === c.id)?.values;
      const st = status(month);
      const actual = st === "future" ? null : (v?.salesActual ?? null);
      const forecast = st === "past" ? actual : st === "current" ? (v?.salesForecast ?? actual) : null;
      const basis = st === "past" ? actual : forecast;
      return {
        month,
        status: st,
        open: clinicOpenIn(c, month),
        budget,
        staff: staff ?? null,
        perStaff: staff ? Math.round(budget / staff) : null,
        actual,
        forecast,
        rate: budget > 0 && basis != null ? Math.round((basis / budget) * 1000) / 10 : null,
      };
    });
    const open = cells.filter((x) => x.open);
    // 実績（今月は着地予想）がある月だけで比べる。数字を取り込んでいない月は含めない
    const toDate = cells.filter((x) => x.status !== "future" && x.forecast != null);
    const totalBudget = cells.reduce((n, x) => n + x.budget, 0);
    const originalTotal = original ? months.reduce((n, m) => n + cellOf(original, clinics, m, c.id).amountJpy, 0) : null;
    return {
      clinicId: c.id,
      name: c.name,
      short: c.short,
      added: Boolean(c.added),
      openedMonth: c.openedMonth ?? null,
      closedMonth: c.closedMonth ?? null,
      cells,
      totalBudget,
      averageBudget: open.length ? Math.round(totalBudget / open.length) : 0,
      /** 当初予算との差（当初予算がなければ null） */
      diffFromOriginal: originalTotal != null ? totalBudget - originalTotal : null,
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
    const staffCells = xs.filter((x) => x.staff != null);
    return {
      month,
      status: status(month),
      budget,
      staff: staffCells.length ? staffCells.reduce((n, x) => n + (x.staff ?? 0), 0) : null,
      openClinics: xs.filter((x) => x.open).length,
      rate: basisBudget ? Math.round((basis / basisBudget) * 1000) / 10 : null,
    };
  });

  const slots = openClinicMonths(clinics);
  const totalBudget = rows.reduce((n, r) => n + r.totalBudget, 0);
  const budgetToDate = rows.reduce((n, r) => n + r.budgetToDate, 0);
  const landingToDate = rows.reduce((n, r) => n + r.landingToDate, 0);
  const originalTotal = original ? rows.reduce((n, r) => n + (r.diffFromOriginal ?? 0), 0) * -1 + totalBudget : null;
  return {
    which,
    standardJpy: src.standardJpy,
    perStaffJpy: src.perStaffJpy,
    confirmed: data.budget.confirmed
      ? { at: data.budget.confirmed.confirmedAt, approvalId: data.budget.confirmed.approvalId, label: data.budget.confirmed.label }
      : null,
    versions: history.map((v, i) => ({ index: i, label: v.label, at: v.confirmedAt, note: v.note })),
    months,
    currentMonth: current,
    rows,
    monthTotals,
    targetJpy: target,
    totalBudget,
    originalTotal,
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
