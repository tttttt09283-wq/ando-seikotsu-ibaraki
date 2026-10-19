/**
 * 資金繰りの計算で使う型（DBの行と同じ形。金額は円の整数、日付は Asia/Tokyo の暦日 YYYY-MM-DD）。
 */

export type Role = "owner" | "accountant" | "viewer";
export const ROLE_LABEL: Record<Role, string> = { owner: "オーナー", accountant: "経理担当", viewer: "閲覧専用" };

export type Direction = "in" | "out";
export type TxStatus = "planned" | "confirmed" | "canceled";
export type Certainty = "fixed" | "expected";

export const IN_CATEGORIES = ["sales", "receivable", "loan_proceeds", "other_in"] as const;
export const OUT_CATEGORIES = ["rent", "payroll", "purchase", "tax", "social_insurance", "loan_principal", "loan_interest", "other_out"] as const;
export type Category = (typeof IN_CATEGORIES)[number] | (typeof OUT_CATEGORIES)[number] | "transfer";

export const CATEGORY_LABEL: Record<Category, string> = {
  sales: "売上入金",
  receivable: "売掛金回収",
  loan_proceeds: "借入入金",
  other_in: "その他入金",
  rent: "家賃",
  payroll: "給与",
  purchase: "仕入",
  tax: "税金",
  social_insurance: "社会保険",
  loan_principal: "借入返済（元本）",
  loan_interest: "借入利息",
  other_out: "その他支払",
  transfer: "口座間振替",
};

export type Organization = { id: string; name: string; min_balance_jpy: number; stale_after_days: number };
export type Branch = { id: string; organization_id: string; name: string; is_active: boolean; sort_order: number };
export type BankAccount = {
  id: string;
  organization_id: string;
  branch_id: string | null;
  name: string;
  bank_name: string | null;
  kind: "bank" | "cash" | "other";
  number_last4: string | null;
  min_balance_jpy: number;
  is_active: boolean;
  sort_order: number;
};
export type BalanceSnapshot = {
  id: string;
  organization_id: string;
  bank_account_id: string;
  as_of_date: string;
  balance_jpy: number;
  source: "manual" | "csv" | "api";
  note: string | null;
  created_at: string;
};
export type CashTransaction = {
  id: string;
  organization_id: string;
  bank_account_id: string;
  branch_id: string | null;
  direction: Direction;
  category: Category;
  amount_jpy: number;
  planned_date: string | null;
  confirmed_date: string | null;
  status: TxStatus;
  certainty: Certainty;
  counterparty: string | null;
  memo: string | null;
  transfer_group_id: string | null;
  recurring_rule_id: string | null;
  occurrence_date: string | null;
  created_at: string;
  updated_at: string;
};
export type RecurringRule = {
  id: string;
  organization_id: string;
  bank_account_id: string;
  branch_id: string | null;
  direction: Direction;
  category: Exclude<Category, "transfer">;
  amount_jpy: number;
  certainty: Certainty;
  counterparty: string | null;
  memo: string | null;
  frequency: "weekly" | "monthly" | "yearly";
  interval_count: number;
  day_of_month: number | null;
  weekday: number | null;
  month_of_year: number | null;
  start_date: string;
  end_date: string | null;
  weekend_shift: "none" | "previous" | "next";
  is_active: boolean;
};

/** シナリオの仮定（画面に必ず表示する） */
export type ScenarioAssumptions = {
  /** 請求済など確定した入金予定を何日遅れで見込むか */
  fixedInflowDelayDays: number;
  /** 見込みの入金（売上見込みなど）を何割反映するか（0〜1） */
  expectedInflowRate: number;
  /** 期日を過ぎた未入金：含めない／7日後／明日 */
  overdueInflow: "exclude" | "delay7" | "tomorrow";
  /** 見込みの支払を何倍で見込むか（1.1 = 1割増） */
  expectedOutflowRate: number;
};
export type ScenarioKind = "conservative" | "standard" | "optimistic";
