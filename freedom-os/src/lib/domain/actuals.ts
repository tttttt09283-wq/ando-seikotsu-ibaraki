// 月次実績（入力された実データ）の集計。シミュレーション値とは混ぜない。
import { addMonths, diffMonths, monthOf, monthRange } from "../date";
import type { AiBusinessMetrics, BusinessExpense, BusinessRevenue, ClinicMetrics, HouseholdFinance } from "../types";
import { calcOverall, div } from "./calc";

export interface ActualMonth {
  month: string;
  hasData: boolean;
  clinicRevenue: number;
  aiInitialRevenue: number;
  aiRecurringRevenue: number;
  aiProductRevenue: number;
  aiOtherRevenue: number;
  aiRevenue: number;
  totalRevenue: number;
  clinicExpenses: number;
  aiExpenses: number;
  commonExpenses: number;
  expenses: number;
  profit: number;
  taxSocial: number;
  disposableBusiness: number;
  expenseRatio: number | null;
  sessions: number | null;
  newPatients: number | null;
  activePatients: number | null;
  inquiries: number | null;
  cancellations: number | null;
  availableSlots: number | null;
  newContracts: number | null;
  activeContracts: number | null;
  churnedContracts: number | null;
  productsSold: number | null;
  maintenanceHours: number | null;
  employmentIncome: number | null;
  livingCost: number | null;
  emergencyFund: number | null;
}

export interface ActualsInput {
  revenue: BusinessRevenue[];
  expenses: BusinessExpense[];
  clinicMetrics: ClinicMetrics[];
  aiMetrics: AiBusinessMetrics[];
  household: HouseholdFinance[];
  taxSocialRate: number;
}

export interface ActualsSummary {
  months: ActualMonth[]; // 古い順。データのある最初の月〜今月
  byMonth: Map<string, ActualMonth>;
  latest: ActualMonth | null; // 売上・経費・指標のいずれかがある最新月
  latestHousehold: { month: string; emergencyFund: number | null; livingCost: number | null; employmentIncome: number | null } | null;
  trailing12Profit: number;
  trailing12Months: number;
  cumulativeContracts: number;
  latestActivePatients: number | null;
  latestActiveContracts: number | null;
}

function sum<T>(rows: T[], f: (r: T) => number) {
  return rows.reduce((s, r) => s + (Number(f(r)) || 0), 0);
}

export function buildActuals(input: ActualsInput, today: string): ActualsSummary {
  const allMonths = new Set<string>();
  for (const r of input.revenue) allMonths.add(monthOf(r.month));
  for (const r of input.expenses) allMonths.add(monthOf(r.month));
  for (const r of input.clinicMetrics) allMonths.add(monthOf(r.month));
  for (const r of input.aiMetrics) allMonths.add(monthOf(r.month));
  for (const r of input.household) allMonths.add(monthOf(r.month));
  const sorted = [...allMonths].sort();
  const thisMonth = monthOf(today);
  const first = sorted[0] ?? thisMonth;
  const last = sorted.length && sorted[sorted.length - 1] > thisMonth ? sorted[sorted.length - 1] : thisMonth;
  const range = monthRange(first, diffMonths(last, first) + 1);

  const months: ActualMonth[] = range.map((m) => {
    const rev = input.revenue.filter((r) => monthOf(r.month) === m);
    const exp = input.expenses.filter((r) => monthOf(r.month) === m);
    const cm = input.clinicMetrics.find((r) => monthOf(r.month) === m) ?? null;
    const am = input.aiMetrics.find((r) => monthOf(r.month) === m) ?? null;
    const hh = input.household.find((r) => monthOf(r.month) === m) ?? null;
    const clinicRevenue = sum(rev.filter((r) => r.business === "clinic"), (r) => r.amount);
    const aiRev = rev.filter((r) => r.business === "ai");
    const aiInitialRevenue = sum(aiRev.filter((r) => r.category === "initial"), (r) => r.amount);
    const aiRecurringRevenue = sum(aiRev.filter((r) => r.category === "recurring"), (r) => r.amount);
    const aiProductRevenue = sum(aiRev.filter((r) => r.category === "product"), (r) => r.amount);
    const aiOtherRevenue = sum(aiRev.filter((r) => r.category === "other" || r.category === "treatment"), (r) => r.amount);
    const aiRevenue = aiInitialRevenue + aiRecurringRevenue + aiProductRevenue + aiOtherRevenue;
    const clinicExpenses = sum(exp.filter((r) => r.business === "clinic"), (r) => r.amount);
    const aiExpenses = sum(exp.filter((r) => r.business === "ai"), (r) => r.amount);
    const commonExpenses = sum(exp.filter((r) => r.business === "common"), (r) => r.amount);
    const o = calcOverall({
      clinicRevenue,
      aiRevenue,
      expenses: clinicExpenses + aiExpenses + commonExpenses,
      taxSocialRate: input.taxSocialRate,
      livingCost: hh?.living_cost ?? 0,
      employmentIncome: hh?.employment_income_net ?? 0,
    });
    const hasData = rev.length > 0 || exp.length > 0 || !!cm || !!am;
    return {
      month: m,
      hasData,
      clinicRevenue,
      aiInitialRevenue,
      aiRecurringRevenue,
      aiProductRevenue,
      aiOtherRevenue,
      aiRevenue,
      totalRevenue: o.totalRevenue,
      clinicExpenses,
      aiExpenses,
      commonExpenses,
      expenses: o.expenses,
      profit: o.profit,
      taxSocial: o.taxSocial,
      disposableBusiness: o.disposableBusiness,
      expenseRatio: o.expenseRatio,
      sessions: cm?.sessions ?? null,
      newPatients: cm?.new_patients ?? null,
      activePatients: cm?.active_patients ?? null,
      inquiries: cm?.inquiries ?? null,
      cancellations: cm?.cancellations ?? null,
      availableSlots: cm?.available_slots ?? null,
      newContracts: am?.new_contracts ?? null,
      activeContracts: am?.active_contracts ?? null,
      churnedContracts: am?.churned_contracts ?? null,
      productsSold: am?.products_sold ?? null,
      maintenanceHours: am?.maintenance_hours ?? null,
      employmentIncome: hh?.employment_income_net ?? null,
      livingCost: hh?.living_cost ?? null,
      emergencyFund: hh?.emergency_fund_balance ?? null,
    };
  });

  const byMonth = new Map(months.map((m) => [m.month, m]));
  const withData = months.filter((m) => m.hasData);
  const latest = withData[withData.length - 1] ?? null;
  const hhSorted = [...input.household].sort((a, b) => a.month.localeCompare(b.month));
  const lastHh = [...hhSorted].reverse().find((h) => h.emergency_fund_balance != null || h.living_cost != null || h.employment_income_net != null) ?? null;

  const t12From = addMonths(thisMonth, -11);
  const t12 = months.filter((m) => m.hasData && m.month >= t12From && m.month <= thisMonth);
  const lastWith = <K extends keyof ActualMonth>(k: K) => {
    for (let i = months.length - 1; i >= 0; i--) {
      const v = months[i][k];
      if (v != null) return v as ActualMonth[K];
    }
    return null;
  };

  return {
    months,
    byMonth,
    latest,
    latestHousehold: lastHh
      ? { month: monthOf(lastHh.month), emergencyFund: lastHh.emergency_fund_balance, livingCost: lastHh.living_cost, employmentIncome: lastHh.employment_income_net }
      : null,
    trailing12Profit: sum(t12, (m) => m.profit),
    trailing12Months: t12.length,
    cumulativeContracts: sum(input.aiMetrics, (r) => r.new_contracts ?? 0),
    latestActivePatients: lastWith("activePatients") as number | null,
    latestActiveContracts: lastWith("activeContracts") as number | null,
  };
}

/** 直近 n か月（今月を含まない完了月）の実績。データが無い月は hasData=false のまま返す */
export function lastCompletedMonths(a: ActualsSummary, today: string, n: number): ActualMonth[] {
  const thisMonth = monthOf(today);
  const out: ActualMonth[] = [];
  for (let i = n; i >= 1; i--) {
    const m = addMonths(thisMonth, -i);
    out.push(a.byMonth.get(m) ?? emptyMonth(m));
  }
  return out;
}

/** 直近 n か月（今月を含む） */
export function recentMonths(a: ActualsSummary, today: string, n: number): ActualMonth[] {
  const thisMonth = monthOf(today);
  return monthRange(addMonths(thisMonth, -(n - 1)), n).map((m) => a.byMonth.get(m) ?? emptyMonth(m));
}

export function emptyMonth(m: string): ActualMonth {
  return {
    month: m,
    hasData: false,
    clinicRevenue: 0,
    aiInitialRevenue: 0,
    aiRecurringRevenue: 0,
    aiProductRevenue: 0,
    aiOtherRevenue: 0,
    aiRevenue: 0,
    totalRevenue: 0,
    clinicExpenses: 0,
    aiExpenses: 0,
    commonExpenses: 0,
    expenses: 0,
    profit: 0,
    taxSocial: 0,
    disposableBusiness: 0,
    expenseRatio: null,
    sessions: null,
    newPatients: null,
    activePatients: null,
    inquiries: null,
    cancellations: null,
    availableSlots: null,
    newContracts: null,
    activeContracts: null,
    churnedContracts: null,
    productsSold: null,
    maintenanceHours: null,
    employmentIncome: null,
    livingCost: null,
    emergencyFund: null,
  };
}

/** 月次継続率 = (今月の継続患者 − 今月の新患) ÷ 前月の継続患者 */
export function monthlyRetention(prev: ActualMonth | undefined, cur: ActualMonth | undefined): number | null {
  if (!prev || !cur || prev.activePatients == null || cur.activePatients == null || cur.newPatients == null) return null;
  const r = div(cur.activePatients - cur.newPatients, prev.activePatients);
  return r == null ? null : Math.max(0, Math.min(1, r));
}

/** 月次解約率 = 今月の解約数 ÷ 前月の継続契約数 */
export function monthlyChurn(prev: ActualMonth | undefined, cur: ActualMonth | undefined): number | null {
  if (!prev || !cur || prev.activeContracts == null || cur.churnedContracts == null) return null;
  if (prev.activeContracts === 0) return cur.churnedContracts === 0 ? 0 : null;
  return Math.max(0, Math.min(1, cur.churnedContracts / prev.activeContracts));
}

/** 利益が基準以上だった月の連続数（直近の完了月から遡る） */
export function consecutiveProfitMonths(a: ActualsSummary, today: string, threshold: number): number {
  let n = 0;
  const months = lastCompletedMonths(a, today, 36).reverse();
  for (const m of months) {
    if (m.hasData && m.profit >= threshold) n++;
    else break;
  }
  return n;
}
