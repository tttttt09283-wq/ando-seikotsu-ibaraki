// シナリオの月次予測（36か月など）。すべて「仮定に基づく試算」。
import { addMonths, diffMonths, monthOf } from "../date";
import type { Assumptions } from "./assumptions";
import { calcOverall, clinicExpenses, plannedClinicSessions, safeNum, yenRound } from "./calc";

export interface ProjectionContext {
  startMonth: string; // "YYYY-MM-01"
  months: number;
  independenceDate: string; // この月から独立後の前提に切り替える
  taxSocialRate: number;
  livingCost: number;
  employmentTakehome: number;
  employmentWeeklyHours: number;
  weeklyDiscretionaryHours: number;
  /** 実績の最新残高があればこちらを優先 */
  initialBalance?: number | null;
  /** 実績の最新値（継続患者数・契約数）があれば初期値として優先 */
  initialActivePatients?: number | null;
  initialContracts?: number | null;
}

export interface ProjectionRow {
  month: string;
  index: number;
  independent: boolean;
  clinicNew: number;
  clinicActive: number;
  clinicDemand: number;
  clinicCapacity: number;
  clinicSessions: number;
  clinicRevenue: number;
  clinicExpenses: number;
  aiNew: number;
  aiContracts: number;
  aiInitialRevenue: number;
  aiRecurringRevenue: number;
  aiProductRevenue: number;
  aiRevenue: number;
  aiExpenses: number;
  totalRevenue: number;
  expenses: number;
  profit: number;
  taxSocial: number;
  disposableBusiness: number;
  employmentIncome: number;
  householdIncome: number;
  livingCost: number;
  savingsCapacity: number;
  oneOff: number;
  balance: number;
  businessHoursMonthly: number;
  businessHoursWeekly: number;
  totalWorkHoursWeekly: number;
  familyHoursWeekly: number;
}

const WEEKS_PER_MONTH = 52 / 12;

export function projectScenario(a: Assumptions, ctx: ProjectionContext): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  const indepMonth = monthOf(ctx.independenceDate);
  let active = Math.max(0, safeNum(ctx.initialActivePatients ?? a.clinic_initial_active));
  let contracts = Math.max(0, safeNum(ctx.initialContracts ?? a.ai_initial_contracts));
  let balance = yenRound(safeNum(ctx.initialBalance ?? a.initial_savings));
  const retention = Math.min(1, Math.max(0, a.clinic_retention_rate));
  const churn = Math.min(1, Math.max(0, a.ai_churn_rate));

  for (let i = 0; i < Math.max(0, ctx.months); i++) {
    const month = addMonths(ctx.startMonth, i);
    const independent = diffMonths(month, indepMonth) >= 0;
    const workDays = independent ? a.clinic_work_days_post : a.clinic_work_days_pre;

    // 施術：コホートで需要を出し、予約枠（稼働率・キャンセル込み）で頭打ち
    const clinicNew = Math.max(0, independent ? a.clinic_new_patients_post : a.clinic_new_patients_pre);
    active = active * retention + clinicNew;
    const clinicDemand = active * Math.max(0, a.clinic_visit_frequency);
    const clinicCapacity = plannedClinicSessions({
      dailySlots: a.clinic_daily_slots,
      workDays,
      occupancy: a.clinic_occupancy,
      cancelRate: a.clinic_cancel_rate,
      dailyPatients: a.clinic_daily_patients,
    });
    const clinicSessions = Math.min(clinicDemand, clinicCapacity);
    const clinicRevenue = yenRound(clinicSessions * a.clinic_price);
    const cExp = clinicExpenses(
      { consumablesPerSession: a.clinic_consumables_per_session, adCost: a.clinic_ad_cost, paymentFeeRate: a.clinic_payment_fee_rate, otherCost: a.clinic_other_cost },
      clinicSessions,
      clinicRevenue,
    ).total;

    // AI：契約数 = 前月 × (1 − 解約率) + 新規
    const aiNew = Math.max(0, independent ? a.ai_new_contracts_post : a.ai_new_contracts_pre);
    contracts = contracts * (1 - churn) + aiNew;
    const aiInitialRevenue = yenRound(aiNew * a.ai_initial_fee);
    const aiRecurringRevenue = yenRound(contracts * a.ai_monthly_fee);
    const productSales = Math.max(0, a.ai_product_sales * Math.pow(1 + a.ai_product_growth_rate, i));
    const aiProductRevenue = yenRound(productSales * a.ai_product_price);
    const aiRevenue = aiInitialRevenue + aiRecurringRevenue + aiProductRevenue;
    const aiExpenses = yenRound(a.ai_server_cost + a.ai_api_cost_per_contract * contracts + a.ai_outsourcing_cost + a.ai_other_cost);

    const employmentIncome = independent ? 0 : yenRound(ctx.employmentTakehome);
    const o = calcOverall({
      clinicRevenue,
      aiRevenue,
      expenses: cExp + aiExpenses,
      taxSocialRate: ctx.taxSocialRate,
      livingCost: ctx.livingCost,
      employmentIncome,
    });
    const oneOff = month === indepMonth ? yenRound(a.startup_cost) : 0;
    balance = balance + o.savingsCapacity - oneOff;

    const businessHoursMonthly =
      (clinicSessions * a.clinic_session_minutes) / 60 + contracts * a.ai_maintenance_hours + aiNew * a.ai_setup_hours + a.admin_hours_monthly;
    const businessHoursWeekly = businessHoursMonthly / WEEKS_PER_MONTH;
    const totalWorkHoursWeekly = businessHoursWeekly + (independent ? 0 : ctx.employmentWeeklyHours);
    const familyHoursWeekly = Math.max(0, ctx.weeklyDiscretionaryHours - totalWorkHoursWeekly);

    rows.push({
      month,
      index: i,
      independent,
      clinicNew,
      clinicActive: active,
      clinicDemand,
      clinicCapacity,
      clinicSessions,
      clinicRevenue,
      clinicExpenses: cExp,
      aiNew,
      aiContracts: contracts,
      aiInitialRevenue,
      aiRecurringRevenue,
      aiProductRevenue,
      aiRevenue,
      aiExpenses,
      totalRevenue: o.totalRevenue,
      expenses: o.expenses,
      profit: o.profit,
      taxSocial: o.taxSocial,
      disposableBusiness: o.disposableBusiness,
      employmentIncome,
      householdIncome: o.householdIncome,
      livingCost: o.livingCost,
      savingsCapacity: o.savingsCapacity,
      oneOff,
      balance,
      businessHoursMonthly,
      businessHoursWeekly,
      totalWorkHoursWeekly,
      familyHoursWeekly,
    });
  }
  return rows;
}

/** 指標が目標に初めて到達する月（到達しなければ null） */
export function firstMonthReaching(rows: ProjectionRow[], pick: (r: ProjectionRow) => number, target: number): string | null {
  const hit = rows.find((r) => pick(r) >= target);
  return hit ? hit.month : null;
}

export interface ScenarioExpectation {
  checks: { code: string; label: string; ok: boolean | null; detail: string }[];
  okCount: number;
  total: number;
}

/** 独立月時点で、試算上どの独立条件を満たしそうか（開業準備は試算できないので対象外） */
export function scenarioExpectation(
  rows: ProjectionRow[],
  p: {
    independenceDate: string;
    profitThreshold: number;
    emergencyMonths: number;
    livingCost: number;
    activePatientsMin: number;
    contractsMin: number;
    maxWeeklyHours: number;
  },
): ScenarioExpectation {
  const im = monthOf(p.independenceDate);
  const idx = rows.findIndex((r) => r.month === im);
  const checks: ScenarioExpectation["checks"] = [];
  if (idx < 0) {
    return { checks: [{ code: "range", label: "独立月が試算期間外", ok: null, detail: "試算期間を延ばすか、独立予定日を見直してください" }], okCount: 0, total: 0 };
  }
  const before = rows.slice(Math.max(0, idx - 6), idx);
  const at = rows[idx];
  const after = rows.slice(idx, idx + 6);
  const prior = rows[idx - 1] ?? at;
  checks.push({
    code: "profit",
    label: "独立前6か月の事業利益",
    ok: before.length >= 6 ? before.every((r) => r.profit >= p.profitThreshold) : null,
    detail: before.length >= 6 ? `最小 ${Math.round(Math.min(...before.map((r) => r.profit)) / 10000)}万円` : "試算開始から6か月未満",
  });
  checks.push({
    code: "emergency_fund",
    label: "生活防衛資金",
    ok: prior.balance >= p.livingCost * p.emergencyMonths,
    detail: `独立直前 ${Math.round(prior.balance / 10000)}万円（必要 ${Math.round((p.livingCost * p.emergencyMonths) / 10000)}万円）`,
  });
  checks.push({
    code: "clinic_retention",
    label: "施術の継続患者数",
    ok: prior.clinicActive >= p.activePatientsMin,
    detail: `${prior.clinicActive.toFixed(0)}人（基準 ${p.activePatientsMin}人）`,
  });
  checks.push({
    code: "ai_stability",
    label: "AI継続契約",
    ok: prior.aiContracts >= p.contractsMin,
    detail: `${prior.aiContracts.toFixed(1)}社（基準 ${p.contractsMin}社）`,
  });
  const maxHours = Math.max(...after.map((r) => r.businessHoursWeekly));
  checks.push({
    code: "work_hours",
    label: "独立後の労働時間",
    ok: maxHours <= p.maxWeeklyHours,
    detail: `週 ${maxHours.toFixed(1)}時間（上限 ${p.maxWeeklyHours}時間）`,
  });
  const minDisp = Math.min(...after.map((r) => r.disposableBusiness));
  checks.push({
    code: "household",
    label: "独立後の手取りで生活費を賄える",
    ok: minDisp >= p.livingCost,
    detail: `最小 ${Math.round(minDisp / 10000)}万円／月（生活費 ${Math.round(p.livingCost / 10000)}万円）`,
  });
  const okCount = checks.filter((c) => c.ok === true).length;
  return { checks, okCount, total: checks.length };
}
