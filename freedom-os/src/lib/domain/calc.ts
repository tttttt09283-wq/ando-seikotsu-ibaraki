// 収益計算の純粋関数。未入力（null/NaN）や 0 除算は null を返し、画面で「—」と表示する。
// 金額は円の整数に丸める（内部計算は小数、結果だけ丸める）。

export const safeNum = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
export const div = (a: number, b: number): number | null => (b === 0 || !Number.isFinite(a) || !Number.isFinite(b) ? null : a / b);
export const yenRound = (v: number): number => Math.round(v);
const clamp01 = (v: number) => Math.min(1, Math.max(0, safeNum(v)));

// ---------------------------------------------------------------------------
// 施術事業
// ---------------------------------------------------------------------------
export interface ClinicInput {
  price: number;
  dailyPatients: number;
  workDays: number;
  dailySlots: number;
  occupancy: number;
  cancelRate: number;
  visitFrequency: number;
  newPatients: number;
  retentionRate: number;
  consumablesPerSession: number;
  adCost: number;
  paymentFeeRate: number;
  otherCost: number;
}

export interface ClinicResult {
  monthlySlots: number;
  /** 予約枠×稼働率×(1−キャンセル率)。1日施術人数の上限でも頭打ち */
  plannedSessions: number;
  /** 実績があれば実績、なければ計画値 */
  sessions: number;
  sessionsSource: "actual" | "plan";
  requiredPatients: number | null;
  revenue: number;
  consumables: number;
  paymentFees: number;
  expenses: number;
  profit: number;
  /** 継続率を考慮した、患者数を維持するのに必要な新患数／月 */
  requiredNewPatients: number | null;
  target: {
    revenue: number;
    sessions: number | null;
    patients: number | null;
    newPatients: number | null;
    shortfall: number;
    shortfallSessions: number | null;
  } | null;
}

/** 施術件数 = 予約枠 × 稼働率 × (1 − キャンセル率)。上限 = 1日施術人数 × 営業日数 */
export function plannedClinicSessions(i: Pick<ClinicInput, "dailySlots" | "workDays" | "occupancy" | "cancelRate" | "dailyPatients">): number {
  const slots = safeNum(i.dailySlots) * safeNum(i.workDays);
  const byOccupancy = slots * clamp01(i.occupancy) * (1 - clamp01(i.cancelRate));
  const cap = safeNum(i.dailyPatients) > 0 ? safeNum(i.dailyPatients) * safeNum(i.workDays) : Infinity;
  return Math.max(0, Math.min(byOccupancy, cap));
}

export function clinicRevenue(price: number, sessions: number): number {
  return yenRound(safeNum(price) * safeNum(sessions));
}

export function clinicExpenses(i: Pick<ClinicInput, "consumablesPerSession" | "adCost" | "paymentFeeRate" | "otherCost">, sessions: number, revenue: number) {
  const consumables = yenRound(safeNum(i.consumablesPerSession) * safeNum(sessions));
  const paymentFees = yenRound(safeNum(revenue) * clamp01(i.paymentFeeRate));
  const total = consumables + paymentFees + yenRound(safeNum(i.adCost)) + yenRound(safeNum(i.otherCost));
  return { consumables, paymentFees, total };
}

/** 必要実患者数 = 施術件数 ÷ 月平均来院頻度 */
export function requiredPatients(sessions: number, visitFrequency: number): number | null {
  return div(safeNum(sessions), safeNum(visitFrequency));
}

/** 定常状態で患者数を維持するのに必要な新患数 = 患者数 × (1 − 継続率) */
export function steadyStateNewPatients(patients: number | null, retentionRate: number): number | null {
  if (patients == null) return null;
  return patients * (1 - clamp01(retentionRate));
}

export function calcClinic(i: ClinicInput, opts: { targetRevenue?: number; actualSessions?: number | null } = {}): ClinicResult {
  const monthlySlots = safeNum(i.dailySlots) * safeNum(i.workDays);
  const plannedSessions = plannedClinicSessions(i);
  const hasActual = opts.actualSessions != null && Number.isFinite(opts.actualSessions);
  const sessions = hasActual ? safeNum(opts.actualSessions) : plannedSessions;
  const revenue = clinicRevenue(i.price, sessions);
  const exp = clinicExpenses(i, sessions, revenue);
  const patients = requiredPatients(sessions, i.visitFrequency);
  let target: ClinicResult["target"] = null;
  if (opts.targetRevenue != null && opts.targetRevenue > 0) {
    const tSessions = div(opts.targetRevenue, safeNum(i.price));
    const tPatients = tSessions == null ? null : requiredPatients(tSessions, i.visitFrequency);
    target = {
      revenue: opts.targetRevenue,
      sessions: tSessions == null ? null : Math.ceil(tSessions),
      patients: tPatients == null ? null : Math.ceil(tPatients),
      newPatients: tPatients == null ? null : steadyStateNewPatients(tPatients, i.retentionRate),
      shortfall: Math.max(0, opts.targetRevenue - revenue),
      shortfallSessions: tSessions == null ? null : Math.max(0, Math.ceil(tSessions - sessions)),
    };
  }
  return {
    monthlySlots,
    plannedSessions,
    sessions,
    sessionsSource: hasActual ? "actual" : "plan",
    requiredPatients: patients,
    revenue,
    consumables: exp.consumables,
    paymentFees: exp.paymentFees,
    expenses: exp.total,
    profit: revenue - exp.total,
    requiredNewPatients: steadyStateNewPatients(patients, i.retentionRate),
    target,
  };
}

/**
 * 月次コホートモデル：継続患者数[t] = 継続患者数[t−1] × 継続率 + 新患数[t]
 * 戻り値は各月末の継続患者数（小数のまま。期待値）
 */
export function patientCohort(initialActive: number, newPatients: number[], retentionRate: number): number[] {
  const r = clamp01(retentionRate);
  const out: number[] = [];
  let active = Math.max(0, safeNum(initialActive));
  for (const n of newPatients) {
    active = active * r + Math.max(0, safeNum(n));
    out.push(active);
  }
  return out;
}

/**
 * months か月後に継続患者数 target に到達するための、毎月一定の必要新患数。
 * active_m = current·r^m + N·(1−r^m)/(1−r) を N について解く。
 */
export function requiredMonthlyNew(target: number, current: number, retentionRate: number, months: number): number | null {
  if (!(months > 0)) return null;
  const r = clamp01(retentionRate);
  const t = Math.max(0, safeNum(target));
  const c = Math.max(0, safeNum(current));
  if (r >= 1) return Math.max(0, (t - c) / months);
  const rm = Math.pow(r, months);
  const n = ((t - c * rm) * (1 - r)) / (1 - rm);
  return Math.max(0, n);
}

// ---------------------------------------------------------------------------
// AI 事業
// ---------------------------------------------------------------------------
export interface AiInput {
  initialFee: number;
  monthlyFee: number;
  newContracts: number;
  activeContracts: number;
  churnRate: number;
  productPrice: number;
  productSales: number;
  serverCost: number;
  apiCostPerContract: number;
  outsourcingCost: number;
  maintenanceHoursPerContract: number;
  setupHoursPerContract: number;
  otherCost: number;
}

export interface AiResult {
  initialRevenue: number;
  recurringRevenue: number;
  productRevenue: number;
  revenue: number;
  apiCost: number;
  expenses: number;
  profit: number;
  maintenanceHours: number;
  maintenanceHoursPerContract: number | null;
  setupHours: number;
  laborHours: number;
  /** 解約率を考慮して、この新規契約数で長期的に落ち着く契約数 */
  steadyStateContracts: number | null;
}

export function aiRecurringRevenue(monthlyFee: number, activeContracts: number): number {
  return yenRound(safeNum(monthlyFee) * safeNum(activeContracts));
}

export function calcAi(i: AiInput): AiResult {
  const initialRevenue = yenRound(safeNum(i.initialFee) * safeNum(i.newContracts));
  const recurringRevenue = aiRecurringRevenue(i.monthlyFee, i.activeContracts);
  const productRevenue = yenRound(safeNum(i.productPrice) * safeNum(i.productSales));
  const revenue = initialRevenue + recurringRevenue + productRevenue;
  const apiCost = yenRound(safeNum(i.apiCostPerContract) * safeNum(i.activeContracts));
  const expenses = yenRound(safeNum(i.serverCost)) + apiCost + yenRound(safeNum(i.outsourcingCost)) + yenRound(safeNum(i.otherCost));
  const maintenanceHours = safeNum(i.maintenanceHoursPerContract) * safeNum(i.activeContracts);
  const setupHours = safeNum(i.setupHoursPerContract) * safeNum(i.newContracts);
  const churn = clamp01(i.churnRate);
  return {
    initialRevenue,
    recurringRevenue,
    productRevenue,
    revenue,
    apiCost,
    expenses,
    profit: revenue - expenses,
    maintenanceHours,
    maintenanceHoursPerContract: safeNum(i.activeContracts) > 0 ? maintenanceHours / safeNum(i.activeContracts) : null,
    setupHours,
    laborHours: maintenanceHours + setupHours,
    steadyStateContracts: churn > 0 ? safeNum(i.newContracts) / churn : null,
  };
}

/** 契約数[t] = 契約数[t−1] × (1 − 解約率) + 新規[t] */
export function contractSeries(initial: number, newContracts: number[], churnRate: number): number[] {
  const c = clamp01(churnRate);
  const out: number[] = [];
  let active = Math.max(0, safeNum(initial));
  for (const n of newContracts) {
    active = active * (1 - c) + Math.max(0, safeNum(n));
    out.push(active);
  }
  return out;
}

/** AI 月商の目標に必要な継続契約数（初期導入料と商品売上を差し引いた残りを月額で割る） */
export function requiredContracts(targetAiRevenue: number, monthlyFee: number, otherAiRevenue = 0): number | null {
  const need = Math.max(0, safeNum(targetAiRevenue) - safeNum(otherAiRevenue));
  const n = div(need, safeNum(monthlyFee));
  return n == null ? null : Math.ceil(n - 1e-9);
}

// ---------------------------------------------------------------------------
// 全体収支
// ---------------------------------------------------------------------------
export interface OverallInput {
  clinicRevenue: number;
  aiRevenue: number;
  expenses: number;
  taxSocialRate: number;
  livingCost: number;
  employmentIncome: number; // 本業の手取り（独立後は 0）
  otherIncome?: number;
}
export interface OverallResult {
  totalRevenue: number;
  expenses: number;
  profit: number;
  /** 税金・社会保険の概算（事業利益 × 概算負担率。赤字なら 0） */
  taxSocial: number;
  /** 事業の税引後手取り（概算） */
  disposableBusiness: number;
  householdIncome: number;
  livingCost: number;
  savingsCapacity: number;
  expenseRatio: number | null;
}

export function calcOverall(i: OverallInput): OverallResult {
  const totalRevenue = yenRound(safeNum(i.clinicRevenue) + safeNum(i.aiRevenue));
  const expenses = yenRound(safeNum(i.expenses));
  const profit = totalRevenue - expenses;
  const taxSocial = yenRound(Math.max(0, profit) * clamp01(i.taxSocialRate));
  const disposableBusiness = profit - taxSocial;
  const householdIncome = disposableBusiness + yenRound(safeNum(i.employmentIncome)) + yenRound(safeNum(i.otherIncome));
  const livingCost = yenRound(safeNum(i.livingCost));
  return {
    totalRevenue,
    expenses,
    profit,
    taxSocial,
    disposableBusiness,
    householdIncome,
    livingCost,
    savingsCapacity: householdIncome - livingCost,
    expenseRatio: div(expenses, totalRevenue),
  };
}

/** 家計資金の残高推移：残高[t] = 残高[t−1] + 貯蓄余力[t] − 一時支出[t] */
export function balanceSeries(initial: number, savings: number[], oneOff: number[] = []): number[] {
  const out: number[] = [];
  let b = yenRound(safeNum(initial));
  savings.forEach((s, idx) => {
    b = b + yenRound(safeNum(s)) - yenRound(safeNum(oneOff[idx]));
    out.push(b);
  });
  return out;
}

/** 必要な月次成長率（複利）。現在値が 0 以下なら計算できない */
export function requiredGrowthRate(current: number, target: number, months: number): number | null {
  if (!(current > 0) || !(target > 0) || !(months > 0)) return null;
  return Math.pow(target / current, 1 / months) - 1;
}
