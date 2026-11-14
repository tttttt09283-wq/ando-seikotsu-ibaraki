import type { TableMap, TableName } from "../../types";

export type Row<T extends TableName> = TableMap[T];
export type Match<T extends TableName> = Partial<Row<T>>;

/** ユーザー1人分にスコープされたデータストア（user_id は自動で付与・絞り込み） */
export interface UserStore {
  readonly userId: string;
  readonly mode: "supabase" | "local";
  list<T extends TableName>(table: T): Promise<Row<T>[]>;
  insert<T extends TableName>(table: T, rows: Partial<Row<T>>[]): Promise<Row<T>[]>;
  /** match に一致する行（本人の行のみ）を更新し、更新後の行を返す */
  update<T extends TableName>(table: T, match: Match<T>, patch: Partial<Row<T>>): Promise<Row<T>[]>;
  /** 一意制約 conflict の列で衝突したら更新（ignore=true なら何もしない） */
  upsert<T extends TableName>(table: T, rows: Partial<Row<T>>[], conflict: string[], ignore?: boolean): Promise<Row<T>[]>;
  remove<T extends TableName>(table: T, match: Match<T>): Promise<number>;
}

/** user_id 列ではなく id 列が本人を表すテーブル */
export const OWNER_COLUMN: Partial<Record<TableName, string>> = { profiles: "id" };
export const ownerCol = (t: TableName) => OWNER_COLUMN[t] ?? "user_id";

/** 主キーが id ではないテーブル */
export const HAS_ID: Record<TableName, boolean> = {
  profiles: true,
  user_settings: false,
  mandala_goals: true,
  mandala_actions: true,
  tasks: true,
  task_dependencies: false,
  milestones: true,
  business_revenue: true,
  business_expenses: true,
  clinic_metrics: true,
  ai_business_metrics: true,
  household_finances: true,
  financial_scenarios: true,
  scenario_assumptions: true,
  independence_criteria: true,
  weekly_reviews: true,
  ai_insights: true,
  audit_logs: true,
};
