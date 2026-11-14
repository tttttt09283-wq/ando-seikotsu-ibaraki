// 独立予定日から逆算：必要な売上成長率・顧客獲得数・契約数・貯蓄額
import { diffMonths, monthOf } from "../date";
import type { Assumptions } from "./assumptions";
import { requiredContracts, requiredGrowthRate, requiredMonthlyNew, requiredPatients, safeNum } from "./calc";

export interface ReverseInput {
  today: string;
  independenceDate: string;
  targetClinicRevenue: number;
  targetAiRevenue: number;
  currentClinicRevenue: number;
  currentAiRevenue: number;
  currentActivePatients: number;
  currentContracts: number;
  currentBalance: number;
  livingCost: number;
  emergencyMonths: number;
  assumptions: Assumptions;
}

export interface ReverseResult {
  monthsLeft: number;
  targetTotal: number;
  currentTotal: number;
  requiredGrowthRate: number | null;
  requiredSessions: number | null;
  requiredPatients: number | null;
  requiredNewPatientsPerMonth: number | null;
  requiredContracts: number | null;
  requiredNewContractsPerMonth: number | null;
  requiredSavingsTotal: number;
  requiredSavingsPerMonth: number | null;
  notes: string[];
}

/**
 * 独立月の時点で「目標月商の何割」を求めるかは assumptions に依存させず、
 * 入力の目標値（施術・AI）をそのまま独立月までに到達させる前提で逆算する。
 */
export function reverseCalc(i: ReverseInput): ReverseResult {
  const notes: string[] = [];
  const monthsLeft = diffMonths(monthOf(i.independenceDate), monthOf(i.today));
  const a = i.assumptions;
  const targetTotal = safeNum(i.targetClinicRevenue) + safeNum(i.targetAiRevenue);
  const currentTotal = safeNum(i.currentClinicRevenue) + safeNum(i.currentAiRevenue);
  if (monthsLeft <= 0) notes.push("独立予定日が今月以前です。将来の日付を指定してください");

  const growth = monthsLeft > 0 ? requiredGrowthRate(currentTotal, targetTotal, monthsLeft) : null;
  if (currentTotal <= 0) notes.push("現在の月商が0円のため成長率は計算できません（実績を入力すると表示されます）");

  const sessions = a.clinic_price > 0 ? Math.ceil(safeNum(i.targetClinicRevenue) / a.clinic_price) : null;
  const patients = sessions == null ? null : requiredPatients(sessions, a.clinic_visit_frequency);
  const patientsCeil = patients == null ? null : Math.ceil(patients);
  const newPatients = patientsCeil != null && monthsLeft > 0 ? requiredMonthlyNew(patientsCeil, i.currentActivePatients, a.clinic_retention_rate, monthsLeft) : null;
  if (a.clinic_visit_frequency <= 0) notes.push("来院頻度が0のため必要患者数は計算できません");

  const productRevenue = a.ai_product_price * a.ai_product_sales;
  const contracts = requiredContracts(i.targetAiRevenue, a.ai_monthly_fee, productRevenue);
  const newContracts = contracts != null && monthsLeft > 0 ? requiredMonthlyNew(contracts, i.currentContracts, 1 - a.ai_churn_rate, monthsLeft) : null;
  if (a.ai_monthly_fee <= 0) notes.push("AI月額料金が0のため必要契約数は計算できません");

  const savingsTotal = Math.max(0, i.livingCost * i.emergencyMonths + a.startup_cost - i.currentBalance);
  notes.push("必要貯蓄額 = 生活費 × 生活防衛資金の月数 + 独立初期費用 − 現在の残高");

  return {
    monthsLeft,
    targetTotal,
    currentTotal,
    requiredGrowthRate: growth,
    requiredSessions: sessions,
    requiredPatients: patientsCeil,
    requiredNewPatientsPerMonth: newPatients,
    requiredContracts: contracts,
    requiredNewContractsPerMonth: newContracts,
    requiredSavingsTotal: Math.round(savingsTotal),
    requiredSavingsPerMonth: monthsLeft > 0 ? Math.round(savingsTotal / monthsLeft) : null,
    notes,
  };
}
