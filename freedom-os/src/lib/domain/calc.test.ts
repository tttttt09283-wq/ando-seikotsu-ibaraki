import { describe, expect, it } from "vitest";
import {
  aiRecurringRevenue,
  balanceSeries,
  calcAi,
  calcClinic,
  calcOverall,
  clinicRevenue,
  contractSeries,
  div,
  patientCohort,
  plannedClinicSessions,
  requiredContracts,
  requiredGrowthRate,
  requiredMonthlyNew,
  requiredPatients,
  safeNum,
} from "./calc";
import { DEFAULT_ASSUMPTIONS, mergeAssumptions } from "./assumptions";
import { projectScenario, scenarioExpectation } from "./projection";
import { reverseCalc } from "./reverse";

const baseClinic = {
  price: 10000,
  dailyPatients: 6,
  workDays: 16,
  dailySlots: 6,
  occupancy: 0.8,
  cancelRate: 0.05,
  visitFrequency: 2,
  newPatients: 10,
  retentionRate: 0.85,
  consumablesPerSession: 300,
  adCost: 20000,
  paymentFeeRate: 0.03,
  otherCost: 10000,
};

const zeroAi = {
  initialFee: 0,
  monthlyFee: 0,
  newContracts: 0,
  activeContracts: 0,
  churnRate: 0,
  productPrice: 0,
  productSales: 0,
  serverCost: 0,
  apiCostPerContract: 0,
  outsourcingCost: 0,
  maintenanceHoursPerContract: 0,
  setupHoursPerContract: 0,
  otherCost: 0,
};

describe("仕様の基準ケース：月商120万円", () => {
  it("施術単価10,000円 × 月80件 = 800,000円", () => {
    expect(clinicRevenue(10000, 80)).toBe(800000);
    const r = calcClinic({ ...baseClinic, consumablesPerSession: 0, adCost: 0, paymentFeeRate: 0, otherCost: 0 }, { actualSessions: 80 });
    expect(r.revenue).toBe(800000);
    expect(r.sessionsSource).toBe("actual");
  });
  it("AI月額50,000円 × 6社 = 継続売上300,000円、商品100,000円でAI売上400,000円", () => {
    expect(aiRecurringRevenue(50000, 6)).toBe(300000);
    const ai = calcAi({ ...zeroAi, monthlyFee: 50000, activeContracts: 6, productPrice: 10000, productSales: 10 });
    expect(ai.recurringRevenue).toBe(300000);
    expect(ai.productRevenue).toBe(100000);
    expect(ai.revenue).toBe(400000);
  });
  it("全体月商は1,200,000円", () => {
    const o = calcOverall({ clinicRevenue: 800000, aiRevenue: 400000, expenses: 0, taxSocialRate: 0.3, livingCost: 0, employmentIncome: 0 });
    expect(o.totalRevenue).toBe(1200000);
  });
});

describe("施術事業", () => {
  it("施術件数 = 予約枠 × 稼働率 × (1 − キャンセル率)", () => {
    // 6枠 × 16日 = 96枠 × 0.8 × 0.95 = 72.96
    expect(plannedClinicSessions(baseClinic)).toBeCloseTo(72.96, 5);
  });
  it("1日施術人数の上限で頭打ちになる", () => {
    expect(plannedClinicSessions({ ...baseClinic, dailySlots: 10, occupancy: 1, cancelRate: 0, dailyPatients: 5 })).toBe(80);
  });
  it("実績がある場合は実績を優先する", () => {
    const r = calcClinic(baseClinic, { actualSessions: 50 });
    expect(r.sessions).toBe(50);
    expect(r.plannedSessions).toBeCloseTo(72.96, 5);
  });
  it("必要実患者数 = 施術件数 ÷ 来院頻度、事業利益 = 売上 − 経費", () => {
    const r = calcClinic(baseClinic, { actualSessions: 80, targetRevenue: 800000 });
    expect(r.requiredPatients).toBe(40);
    // 経費 = 消耗品 24,000 + 決済 24,000 + 広告 20,000 + その他 10,000
    expect(r.expenses).toBe(78000);
    expect(r.profit).toBe(722000);
    expect(r.requiredNewPatients).toBeCloseTo(6, 5);
    expect(r.target?.shortfall).toBe(0);
  });
  it("目標までの不足額・不足件数", () => {
    const r = calcClinic(baseClinic, { actualSessions: 50, targetRevenue: 800000 });
    expect(r.target?.shortfall).toBe(300000);
    expect(r.target?.sessions).toBe(80);
    expect(r.target?.shortfallSessions).toBe(30);
    expect(r.target?.patients).toBe(40);
  });
  it("コホートモデル：継続患者 = 前月 × 継続率 + 新患", () => {
    const s = patientCohort(0, [10, 10, 10], 0.8);
    expect(s[0]).toBeCloseTo(10);
    expect(s[1]).toBeCloseTo(18);
    expect(s[2]).toBeCloseTo(24.4);
  });
  it("必要新患数の逆算はコホートの結果と一致する", () => {
    const n = requiredMonthlyNew(60, 10, 0.85, 24)!;
    const s = patientCohort(10, Array(24).fill(n), 0.85);
    expect(s[23]).toBeCloseTo(60, 6);
    // 継続率100%なら単純な差 ÷ 月数
    expect(requiredMonthlyNew(60, 0, 1, 12)).toBe(5);
    // 既に到達していれば 0
    expect(requiredMonthlyNew(10, 100, 0.9, 12)).toBe(0);
  });
});

describe("AI事業", () => {
  it("解約率を反映した契約数推移", () => {
    const s = contractSeries(10, [0, 0, 2], 0.1);
    expect(s[0]).toBeCloseTo(9);
    expect(s[1]).toBeCloseTo(8.1);
    expect(s[2]).toBeCloseTo(9.29);
  });
  it("初期導入・保守時間・必要労働時間", () => {
    const r = calcAi({ ...zeroAi, initialFee: 200000, monthlyFee: 50000, newContracts: 1, activeContracts: 4, maintenanceHoursPerContract: 3, setupHoursPerContract: 20, apiCostPerContract: 3000, serverCost: 5000 });
    expect(r.initialRevenue).toBe(200000);
    expect(r.recurringRevenue).toBe(200000);
    expect(r.expenses).toBe(17000);
    expect(r.profit).toBe(383000);
    expect(r.maintenanceHours).toBe(12);
    expect(r.maintenanceHoursPerContract).toBe(3);
    expect(r.laborHours).toBe(32);
  });
  it("必要AI契約数の逆算（商品売上を差し引く）", () => {
    expect(requiredContracts(400000, 50000, 100000)).toBe(6);
    expect(requiredContracts(410000, 50000, 100000)).toBe(7);
    expect(requiredContracts(400000, 0)).toBeNull();
  });
});

describe("全体収支・家計", () => {
  it("事業利益・税社保の概算・可処分所得・貯蓄余力", () => {
    const o = calcOverall({ clinicRevenue: 800000, aiRevenue: 400000, expenses: 200000, taxSocialRate: 0.3, livingCost: 350000, employmentIncome: 0 });
    expect(o.profit).toBe(1000000);
    expect(o.taxSocial).toBe(300000);
    expect(o.disposableBusiness).toBe(700000);
    expect(o.savingsCapacity).toBe(350000);
    expect(o.expenseRatio).toBeCloseTo(1 / 6);
  });
  it("赤字のとき税社保の概算は0", () => {
    const o = calcOverall({ clinicRevenue: 0, aiRevenue: 0, expenses: 50000, taxSocialRate: 0.3, livingCost: 300000, employmentIncome: 360000 });
    expect(o.profit).toBe(-50000);
    expect(o.taxSocial).toBe(0);
    expect(o.savingsCapacity).toBe(10000);
  });
  it("家計資金の残高推移（一時支出込み）", () => {
    expect(balanceSeries(1000000, [100000, 100000, -50000], [0, 300000, 0])).toEqual([1100000, 900000, 850000]);
  });
});

describe("0除算・未入力値", () => {
  it("未入力は0や null として安全に扱う", () => {
    expect(safeNum(undefined)).toBe(0);
    expect(safeNum("")).toBe(0);
    expect(safeNum("abc", 5)).toBe(5);
    expect(safeNum(NaN)).toBe(0);
    expect(div(1, 0)).toBeNull();
    expect(requiredPatients(80, 0)).toBeNull();
    expect(requiredGrowthRate(0, 100, 12)).toBeNull();
    const r = calcClinic({ ...baseClinic, price: NaN as unknown as number, visitFrequency: 0 }, { targetRevenue: 800000 });
    expect(r.revenue).toBe(0);
    expect(r.requiredPatients).toBeNull();
    expect(r.target?.sessions).toBeNull();
    const o = calcOverall({ clinicRevenue: 0, aiRevenue: 0, expenses: 0, taxSocialRate: 0.3, livingCost: 0, employmentIncome: 0 });
    expect(o.expenseRatio).toBeNull();
  });
  it("前提値に数値以外が混ざっても既定値に戻す", () => {
    const a = mergeAssumptions("standard", [
      { key: "clinic_price", value: Number("x") },
      { key: "unknown_key", value: 1 },
      { key: "ai_monthly_fee", value: 70000 },
    ]);
    expect(a.clinic_price).toBe(DEFAULT_ASSUMPTIONS.standard.clinic_price);
    expect(a.ai_monthly_fee).toBe(70000);
  });
});

describe("シナリオの月次予測", () => {
  const ctx = {
    startMonth: "2026-11-01",
    months: 36,
    independenceDate: "2028-04-01",
    taxSocialRate: 0.3,
    livingCost: 350000,
    employmentTakehome: 360000,
    employmentWeeklyHours: 45,
    weeklyDiscretionaryHours: 80,
  };
  it("36か月分を出し、独立月から本業収入が0になり初期費用が差し引かれる", () => {
    const rows = projectScenario(DEFAULT_ASSUMPTIONS.standard, ctx);
    expect(rows).toHaveLength(36);
    const idx = rows.findIndex((r) => r.month === "2028-04-01");
    expect(idx).toBe(17);
    expect(rows[idx - 1].independent).toBe(false);
    expect(rows[idx - 1].employmentIncome).toBe(360000);
    expect(rows[idx].independent).toBe(true);
    expect(rows[idx].employmentIncome).toBe(0);
    expect(rows[idx].oneOff).toBe(DEFAULT_ASSUMPTIONS.standard.startup_cost);
    expect(rows[idx].balance).toBe(rows[idx - 1].balance + rows[idx].savingsCapacity - rows[idx].oneOff);
  });
  it("施術件数は需要と予約枠の小さい方", () => {
    const rows = projectScenario(DEFAULT_ASSUMPTIONS.standard, ctx);
    for (const r of rows) expect(r.clinicSessions).toBeCloseTo(Math.min(r.clinicDemand, r.clinicCapacity), 8);
  });
  it("契約数の推移は解約率を反映する", () => {
    const a = { ...DEFAULT_ASSUMPTIONS.standard, ai_initial_contracts: 10, ai_new_contracts_pre: 0, ai_new_contracts_post: 0, ai_churn_rate: 0.1 };
    const rows = projectScenario(a, { ...ctx, months: 3 });
    expect(rows.map((r) => Math.round(r.aiContracts * 100) / 100)).toEqual([9, 8.1, 7.29]);
  });
  it("挑戦シナリオは保守シナリオより最終月の売上が大きい", () => {
    const c = projectScenario(DEFAULT_ASSUMPTIONS.conservative, ctx);
    const h = projectScenario(DEFAULT_ASSUMPTIONS.challenge, ctx);
    expect(h[35].totalRevenue).toBeGreaterThan(c[35].totalRevenue);
  });
  it("独立条件の達成見込みを個別に判定する", () => {
    const rows = projectScenario(DEFAULT_ASSUMPTIONS.standard, ctx);
    const e = scenarioExpectation(rows, { independenceDate: "2028-04-01", profitThreshold: 0, emergencyMonths: 6, livingCost: 350000, activePatientsMin: 0, contractsMin: 0, maxWeeklyHours: 100 });
    expect(e.total).toBe(6);
    expect(e.checks.find((c) => c.code === "profit")?.ok).toBe(true);
    const out = scenarioExpectation(rows.slice(0, 5), { independenceDate: "2028-04-01", profitThreshold: 0, emergencyMonths: 6, livingCost: 350000, activePatientsMin: 0, contractsMin: 0, maxWeeklyHours: 100 });
    expect(out.checks[0].ok).toBeNull();
  });
});

describe("独立予定日からの逆算", () => {
  it("必要な成長率・顧客数・契約数・貯蓄額", () => {
    const r = reverseCalc({
      today: "2026-11-14",
      independenceDate: "2028-04-01",
      targetClinicRevenue: 800000,
      targetAiRevenue: 400000,
      currentClinicRevenue: 100000,
      currentAiRevenue: 50000,
      currentActivePatients: 10,
      currentContracts: 1,
      currentBalance: 3000000,
      livingCost: 350000,
      emergencyMonths: 6,
      assumptions: { ...DEFAULT_ASSUMPTIONS.standard, clinic_price: 10000, clinic_visit_frequency: 2, ai_monthly_fee: 50000, ai_product_price: 10000, ai_product_sales: 10, startup_cost: 1000000 },
    });
    expect(r.monthsLeft).toBe(17);
    expect(r.requiredSessions).toBe(80);
    expect(r.requiredPatients).toBe(40);
    expect(r.requiredContracts).toBe(6);
    expect(r.requiredGrowthRate).toBeCloseTo(Math.pow(8, 1 / 17) - 1, 8);
    // 350,000 × 6 + 1,000,000 − 3,000,000 = 100,000
    expect(r.requiredSavingsTotal).toBe(100000);
    expect(r.requiredSavingsPerMonth).toBe(Math.round(100000 / 17));
    const cohort = patientCohort(10, Array(17).fill(r.requiredNewPatientsPerMonth), 0.85);
    expect(cohort[16]).toBeCloseTo(40, 6);
  });
  it("独立予定日が過去なら計算できない旨を返す", () => {
    const r = reverseCalc({
      today: "2026-11-14",
      independenceDate: "2026-01-01",
      targetClinicRevenue: 800000,
      targetAiRevenue: 400000,
      currentClinicRevenue: 0,
      currentAiRevenue: 0,
      currentActivePatients: 0,
      currentContracts: 0,
      currentBalance: 0,
      livingCost: 350000,
      emergencyMonths: 6,
      assumptions: DEFAULT_ASSUMPTIONS.standard,
    });
    expect(r.requiredGrowthRate).toBeNull();
    expect(r.requiredSavingsPerMonth).toBeNull();
    expect(r.notes.length).toBeGreaterThan(0);
  });
});
