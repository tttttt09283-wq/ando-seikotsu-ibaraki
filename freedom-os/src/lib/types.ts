// DB の各テーブルに対応する行の型（supabase/migrations と一致させる）
// 日付は "YYYY-MM-DD"（日本時間の暦日）、月は "YYYY-MM-01" の文字列で扱う。

export type ISODate = string;

export interface Profile {
  id: string;
  display_name: string;
  occupation: string;
  created_at?: string;
  updated_at?: string;
}

export interface UserSettings {
  user_id: string;
  employment_annual_income: number;
  employment_monthly_takehome: number;
  employment_weekly_hours: number;
  target_monthly_revenue: number;
  target_clinic_revenue: number;
  target_ai_revenue: number;
  target_annual_business_income: number;
  target_year: number;
  independence_target_date: ISODate;
  tax_social_rate: number;
  living_cost_monthly: number;
  emergency_fund_months_min: number;
  emergency_fund_months_target: number;
  max_weekly_work_hours: number;
  work_days_per_week: number;
  family_hours_weekly_target: number;
  daily_available_minutes: number;
  weekly_discretionary_hours: number;
  core_values: string[];
  roadmap_start: ISODate;
  roadmap_end: ISODate;
  updated_at?: string;
}

export const GOAL_CODES = ["CENTER", "A", "B", "C", "D", "E", "F", "G", "H"] as const;
export type GoalCode = (typeof GOAL_CODES)[number];
export type AreaCode = Exclude<GoalCode, "CENTER">;
export const AREA_CODES: AreaCode[] = ["A", "B", "C", "D", "E", "F", "G", "H"];

export interface MandalaGoal {
  id: string;
  user_id: string;
  position: number; // 0 = 中心
  code: GoalCode;
  title: string;
  description: string;
  created_at?: string;
  updated_at?: string;
}

export type ActionStatus = "not_started" | "in_progress" | "achieved" | "missed";
export type KpiDirection = "higher" | "lower";

export interface MandalaAction {
  id: string;
  user_id: string;
  goal_id: string;
  position: number; // 1..8
  title: string;
  description: string;
  category: string;
  priority: number; // 1 = 高, 2 = 中, 3 = 低
  due_date: ISODate | null;
  kpi_name: string;
  kpi_target: number | null;
  kpi_actual: number | null;
  kpi_unit: string;
  kpi_direction: KpiDirection;
  kpi_source: string;
  progress: number;
  status: ActionStatus;
  completed_at: ISODate | null;
  memo: string;
  created_at?: string;
  updated_at?: string;
}

export type TaskLevel = "long" | "year" | "quarter" | "month" | "week" | "day";
export type TaskStatus = "todo" | "doing" | "done" | "blocked";

export interface Task {
  id: string;
  user_id: string;
  mandala_action_id: string | null;
  parent_id: string | null;
  level: TaskLevel;
  title: string;
  purpose: string;
  start_date: ISODate | null;
  due_date: ISODate | null;
  estimate_minutes: number;
  actual_minutes: number | null;
  priority: number;
  status: TaskStatus;
  deliverable: string;
  done_criteria: string;
  source: "manual" | "generator" | "ai" | "import";
  completed_at: ISODate | null;
  created_at?: string;
  updated_at?: string;
}

export interface TaskDependency {
  user_id: string;
  task_id: string;
  depends_on_task_id: string;
  created_at?: string;
}

export interface Milestone {
  id: string;
  user_id: string;
  title: string;
  description: string;
  target_date: ISODate;
  target_amount: number | null;
  metric: string;
  area_code: AreaCode | null;
  status: "planned" | "achieved" | "missed";
  achieved_at: ISODate | null;
  created_at?: string;
  updated_at?: string;
}

export type RevenueBusiness = "clinic" | "ai";
export type RevenueCategory = "treatment" | "initial" | "recurring" | "product" | "other";
export interface BusinessRevenue {
  id: string;
  user_id: string;
  month: ISODate;
  business: RevenueBusiness;
  category: RevenueCategory;
  amount: number;
  note: string;
}

export type ExpenseBusiness = "clinic" | "ai" | "common";
export type ExpenseCategory =
  | "consumables"
  | "advertising"
  | "payment_fees"
  | "server"
  | "ai_api"
  | "outsourcing"
  | "rent"
  | "equipment"
  | "other";
export interface BusinessExpense {
  id: string;
  user_id: string;
  month: ISODate;
  business: ExpenseBusiness;
  category: ExpenseCategory;
  amount: number;
  note: string;
}

export interface ClinicMetrics {
  id: string;
  user_id: string;
  month: ISODate;
  sessions: number | null;
  new_patients: number | null;
  active_patients: number | null;
  cancellations: number | null;
  available_slots: number | null;
  work_days: number | null;
  inquiries: number | null;
  sns_inflow: number | null;
  referrals: number | null;
}

export interface AiBusinessMetrics {
  id: string;
  user_id: string;
  month: ISODate;
  new_contracts: number | null;
  active_contracts: number | null;
  churned_contracts: number | null;
  products_sold: number | null;
  maintenance_hours: number | null;
  dev_hours: number | null;
}

export interface HouseholdFinance {
  id: string;
  user_id: string;
  month: ISODate;
  employment_income_net: number | null;
  other_income: number | null;
  living_cost: number | null;
  emergency_fund_balance: number | null;
  note: string;
}

export type ScenarioKind = "conservative" | "standard" | "challenge";
export interface FinancialScenario {
  id: string;
  user_id: string;
  kind: ScenarioKind;
  name: string;
  description: string;
  start_month: ISODate;
  horizon_months: number;
  is_primary: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ScenarioAssumption {
  id: string;
  user_id: string;
  scenario_id: string;
  key: string;
  value: number;
}

export type CriterionCode =
  | "profit"
  | "emergency_fund"
  | "clinic_retention"
  | "ai_stability"
  | "preparation"
  | "work_hours"
  | "household";

export interface IndependenceCriterion {
  id: string;
  user_id: string;
  code: CriterionCode;
  enabled: boolean;
  threshold: number | null;
  threshold2: number | null;
  manual_confirmed: boolean;
  note: string;
}

export interface WeeklyReview {
  id: string;
  user_id: string;
  week_start: ISODate;
  clinic_revenue: number;
  ai_revenue: number;
  new_customers: number;
  returning_customers: number;
  ai_contracts: number;
  tasks_done: number;
  work_hours: number;
  family_hours: number;
  wins: string;
  issues: string;
  next_focus: string;
  created_at?: string;
  updated_at?: string;
}

export interface AdvisorOutput {
  current: string;
  issues: { title: string; detail: string }[];
  actions: {
    title: string;
    purpose: string;
    estimate_minutes: number;
    due_in_days: number;
    mandala_code: string; // 例 "A8"。該当なしは ""
    done_criteria: string;
  }[];
  expected: { metric: string; target: string; verification: string }[];
  cautions: string[];
}

export type InsightKind = "weekly" | "monthly" | "gap" | "bottleneck" | "timing" | "time";
export interface AiInsight {
  id: string;
  user_id: string;
  kind: InsightKind;
  source: "llm" | "rules";
  model: string;
  input_snapshot: unknown;
  output: AdvisorOutput;
  approved_action_indexes: number[];
  created_at?: string;
}

export interface AuditLog {
  id: string | number;
  user_id: string;
  table_name: string;
  record_id: string;
  action: "insert" | "update" | "delete" | "import" | "export" | "restore" | "purge";
  before: unknown;
  after: unknown;
  created_at?: string;
}

/** ストアが扱うテーブル名と行型の対応 */
export interface TableMap {
  profiles: Profile;
  user_settings: UserSettings;
  mandala_goals: MandalaGoal;
  mandala_actions: MandalaAction;
  tasks: Task;
  task_dependencies: TaskDependency;
  milestones: Milestone;
  business_revenue: BusinessRevenue;
  business_expenses: BusinessExpense;
  clinic_metrics: ClinicMetrics;
  ai_business_metrics: AiBusinessMetrics;
  household_finances: HouseholdFinance;
  financial_scenarios: FinancialScenario;
  scenario_assumptions: ScenarioAssumption;
  independence_criteria: IndependenceCriterion;
  weekly_reviews: WeeklyReview;
  ai_insights: AiInsight;
  audit_logs: AuditLog;
}
export type TableName = keyof TableMap;

/** 画面計算に使う、ユーザーの全データ */
export interface Snapshot {
  profile: Profile | null;
  settings: UserSettings;
  goals: MandalaGoal[];
  actions: MandalaAction[];
  tasks: Task[];
  dependencies: TaskDependency[];
  milestones: Milestone[];
  revenue: BusinessRevenue[];
  expenses: BusinessExpense[];
  clinicMetrics: ClinicMetrics[];
  aiMetrics: AiBusinessMetrics[];
  household: HouseholdFinance[];
  scenarios: FinancialScenario[];
  assumptions: ScenarioAssumption[];
  criteria: IndependenceCriterion[];
  reviews: WeeklyReview[];
  insights: AiInsight[];
}
