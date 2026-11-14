// シナリオの前提値（scenario_assumptions の key と既定値）
// 率（rate）は 0〜1 の小数で保存し、画面では % で表示する。
import type { ScenarioKind } from "../types";

export type FieldKind = "yen" | "count" | "rate" | "hours" | "minutes" | "days" | "times";

export interface AssumptionField {
  key: AssumptionKey;
  label: string;
  group: "clinic" | "ai" | "household";
  kind: FieldKind;
  help?: string;
  min?: number;
  max?: number;
}

export const ASSUMPTION_KEYS = [
  // 施術事業
  "clinic_price",
  "clinic_daily_patients",
  "clinic_work_days_pre",
  "clinic_work_days_post",
  "clinic_daily_slots",
  "clinic_occupancy",
  "clinic_cancel_rate",
  "clinic_visit_frequency",
  "clinic_new_patients_pre",
  "clinic_new_patients_post",
  "clinic_retention_rate",
  "clinic_initial_active",
  "clinic_consumables_per_session",
  "clinic_ad_cost",
  "clinic_payment_fee_rate",
  "clinic_other_cost",
  "clinic_session_minutes",
  // AI 事業
  "ai_initial_fee",
  "ai_monthly_fee",
  "ai_new_contracts_pre",
  "ai_new_contracts_post",
  "ai_initial_contracts",
  "ai_churn_rate",
  "ai_product_price",
  "ai_product_sales",
  "ai_product_growth_rate",
  "ai_server_cost",
  "ai_api_cost_per_contract",
  "ai_outsourcing_cost",
  "ai_maintenance_hours",
  "ai_setup_hours",
  "ai_other_cost",
  // 家計・その他
  "initial_savings",
  "startup_cost",
  "admin_hours_monthly",
] as const;
export type AssumptionKey = (typeof ASSUMPTION_KEYS)[number];
export type Assumptions = Record<AssumptionKey, number>;

export const ASSUMPTION_FIELDS: AssumptionField[] = [
  { key: "clinic_price", label: "施術単価", group: "clinic", kind: "yen", min: 0 },
  { key: "clinic_daily_patients", label: "1日施術人数（上限）", group: "clinic", kind: "count", min: 0, help: "体力的に1日に施術できる最大人数" },
  { key: "clinic_work_days_pre", label: "月間営業日数（独立前）", group: "clinic", kind: "days", min: 0, max: 31, help: "本業と並行している期間" },
  { key: "clinic_work_days_post", label: "月間営業日数（独立後）", group: "clinic", kind: "days", min: 0, max: 31 },
  { key: "clinic_daily_slots", label: "1日の予約枠数", group: "clinic", kind: "count", min: 0 },
  { key: "clinic_occupancy", label: "予約稼働率", group: "clinic", kind: "rate", min: 0, max: 1 },
  { key: "clinic_cancel_rate", label: "キャンセル率", group: "clinic", kind: "rate", min: 0, max: 1 },
  { key: "clinic_visit_frequency", label: "月平均来院頻度", group: "clinic", kind: "times", min: 0, help: "1人が1か月に来院する平均回数" },
  { key: "clinic_new_patients_pre", label: "新患数／月（独立前）", group: "clinic", kind: "count", min: 0 },
  { key: "clinic_new_patients_post", label: "新患数／月（独立後）", group: "clinic", kind: "count", min: 0 },
  { key: "clinic_retention_rate", label: "継続率（月次）", group: "clinic", kind: "rate", min: 0, max: 1, help: "前月の患者が翌月も通う割合" },
  { key: "clinic_initial_active", label: "現在の継続患者数", group: "clinic", kind: "count", min: 0 },
  { key: "clinic_consumables_per_session", label: "消耗品費（1施術あたり）", group: "clinic", kind: "yen", min: 0 },
  { key: "clinic_ad_cost", label: "広告費／月", group: "clinic", kind: "yen", min: 0 },
  { key: "clinic_payment_fee_rate", label: "決済手数料率", group: "clinic", kind: "rate", min: 0, max: 1 },
  { key: "clinic_other_cost", label: "その他経費／月", group: "clinic", kind: "yen", min: 0 },
  { key: "clinic_session_minutes", label: "1施術の所要時間（準備・片付け込み）", group: "clinic", kind: "minutes", min: 0 },

  { key: "ai_initial_fee", label: "初期導入料金", group: "ai", kind: "yen", min: 0 },
  { key: "ai_monthly_fee", label: "月額料金", group: "ai", kind: "yen", min: 0 },
  { key: "ai_new_contracts_pre", label: "新規契約数／月（独立前）", group: "ai", kind: "count", min: 0, help: "0.25 = 4か月に1社" },
  { key: "ai_new_contracts_post", label: "新規契約数／月（独立後）", group: "ai", kind: "count", min: 0 },
  { key: "ai_initial_contracts", label: "現在の継続契約数", group: "ai", kind: "count", min: 0 },
  { key: "ai_churn_rate", label: "解約率（月次）", group: "ai", kind: "rate", min: 0, max: 1 },
  { key: "ai_product_price", label: "デジタル商品単価", group: "ai", kind: "yen", min: 0 },
  { key: "ai_product_sales", label: "商品販売数／月", group: "ai", kind: "count", min: 0 },
  { key: "ai_product_growth_rate", label: "商品販売数の月次成長率", group: "ai", kind: "rate", min: -1, max: 1 },
  { key: "ai_server_cost", label: "サーバー費用／月", group: "ai", kind: "yen", min: 0 },
  { key: "ai_api_cost_per_contract", label: "AI API 利用料金（1社あたり／月）", group: "ai", kind: "yen", min: 0 },
  { key: "ai_outsourcing_cost", label: "外注費／月", group: "ai", kind: "yen", min: 0 },
  { key: "ai_maintenance_hours", label: "保守時間（1社あたり／月）", group: "ai", kind: "hours", min: 0 },
  { key: "ai_setup_hours", label: "導入作業時間（1社あたり）", group: "ai", kind: "hours", min: 0 },
  { key: "ai_other_cost", label: "その他経費／月", group: "ai", kind: "yen", min: 0 },

  { key: "initial_savings", label: "現在の生活防衛資金", group: "household", kind: "yen", min: 0, help: "月次実績に残高がある場合は最新の実績を優先" },
  { key: "startup_cost", label: "独立初期費用（独立月に一括）", group: "household", kind: "yen", min: 0 },
  { key: "admin_hours_monthly", label: "事務・発信の作業時間／月", group: "household", kind: "hours", min: 0 },
];

const STANDARD: Assumptions = {
  clinic_price: 10000,
  clinic_daily_patients: 6,
  clinic_work_days_pre: 4,
  clinic_work_days_post: 17,
  clinic_daily_slots: 6,
  clinic_occupancy: 0.85,
  clinic_cancel_rate: 0.05,
  clinic_visit_frequency: 1.5,
  clinic_new_patients_pre: 3,
  clinic_new_patients_post: 10,
  clinic_retention_rate: 0.85,
  clinic_initial_active: 0,
  clinic_consumables_per_session: 300,
  clinic_ad_cost: 20000,
  clinic_payment_fee_rate: 0.0325,
  clinic_other_cost: 15000,
  clinic_session_minutes: 80,
  ai_initial_fee: 200000,
  ai_monthly_fee: 50000,
  ai_new_contracts_pre: 0.25,
  ai_new_contracts_post: 0.5,
  ai_initial_contracts: 0,
  ai_churn_rate: 0.03,
  ai_product_price: 9800,
  ai_product_sales: 5,
  ai_product_growth_rate: 0.03,
  ai_server_cost: 5000,
  ai_api_cost_per_contract: 3000,
  ai_outsourcing_cost: 0,
  ai_maintenance_hours: 3,
  ai_setup_hours: 20,
  ai_other_cost: 5000,
  initial_savings: 3000000,
  startup_cost: 1000000,
  admin_hours_monthly: 16,
};

export const DEFAULT_ASSUMPTIONS: Record<ScenarioKind, Assumptions> = {
  conservative: {
    ...STANDARD,
    clinic_price: 8000,
    clinic_daily_slots: 5,
    clinic_daily_patients: 5,
    clinic_work_days_post: 16,
    clinic_occupancy: 0.7,
    clinic_cancel_rate: 0.08,
    clinic_new_patients_pre: 2,
    clinic_new_patients_post: 6,
    clinic_retention_rate: 0.8,
    ai_initial_fee: 100000,
    ai_monthly_fee: 30000,
    ai_new_contracts_pre: 0.15,
    ai_new_contracts_post: 0.3,
    ai_churn_rate: 0.05,
    ai_product_sales: 2,
    ai_product_growth_rate: 0.01,
    startup_cost: 1500000,
  },
  standard: STANDARD,
  challenge: {
    ...STANDARD,
    clinic_price: 12000,
    clinic_daily_slots: 7,
    clinic_daily_patients: 7,
    clinic_occupancy: 0.85,
    clinic_new_patients_pre: 4,
    clinic_new_patients_post: 14,
    clinic_retention_rate: 0.88,
    ai_initial_fee: 300000,
    ai_monthly_fee: 60000,
    ai_new_contracts_pre: 0.4,
    ai_new_contracts_post: 0.8,
    ai_churn_rate: 0.02,
    ai_product_price: 14800,
    ai_product_sales: 8,
    ai_product_growth_rate: 0.05,
    ai_outsourcing_cost: 30000,
  },
};

export const SCENARIO_LABEL: Record<ScenarioKind, string> = {
  conservative: "保守シナリオ",
  standard: "標準シナリオ",
  challenge: "挑戦シナリオ",
};
export const SCENARIO_DESC: Record<ScenarioKind, string> = {
  conservative: "単価・稼働率・契約数を控えめに見積もった場合",
  standard: "現実的に達成を目指す基準ケース",
  challenge: "発信と紹介がうまく回り、単価も上げられた場合",
};

/** 保存された行と既定値をマージ（未保存のキーは既定値。数値でない値は既定値に戻す） */
export function mergeAssumptions(kind: ScenarioKind, rows: { key: string; value: number }[]): Assumptions {
  const base: Assumptions = { ...DEFAULT_ASSUMPTIONS[kind] };
  for (const r of rows) {
    if ((ASSUMPTION_KEYS as readonly string[]).includes(r.key)) {
      const v = Number(r.value);
      if (Number.isFinite(v)) base[r.key as AssumptionKey] = v;
    }
  }
  return base;
}
