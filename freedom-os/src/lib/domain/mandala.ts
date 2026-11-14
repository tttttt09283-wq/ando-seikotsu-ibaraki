// マンダラの進捗・状態の計算と、KPI 実績値の自動取得
import { diffDays } from "../date";
import type { ActionStatus, MandalaAction, MandalaGoal, Task, WeeklyReview } from "../types";
import { consecutiveProfitMonths, type ActualsSummary } from "./actuals";

export interface KpiContext {
  actuals: ActualsSummary;
  today: string;
  livingCost: number;
  profitThreshold: number;
  latestReview: WeeklyReview | null;
}

export interface KpiSource {
  key: string;
  label: string;
  unit: string;
  direction: "higher" | "lower";
  resolve: (c: KpiContext) => number | null;
}

const latestVal = (c: KpiContext, f: (m: ActualsSummary["months"][number]) => number | null) => {
  const ms = c.actuals.months.filter((m) => m.hasData);
  for (let i = ms.length - 1; i >= 0; i--) {
    const v = f(ms[i]);
    if (v != null) return v;
  }
  return null;
};

/** 実績から自動取得できる KPI。タスク完了では変わらない（実績入力でだけ更新される） */
export const KPI_SOURCES: KpiSource[] = [
  { key: "manual", label: "手入力", unit: "", direction: "higher", resolve: () => null },
  { key: "clinic_revenue", label: "施術売上（最新月）", unit: "円", direction: "higher", resolve: (c) => c.actuals.latest?.clinicRevenue ?? null },
  { key: "ai_revenue", label: "AI事業売上（最新月）", unit: "円", direction: "higher", resolve: (c) => c.actuals.latest?.aiRevenue ?? null },
  { key: "total_revenue", label: "合計月商（最新月）", unit: "円", direction: "higher", resolve: (c) => c.actuals.latest?.totalRevenue ?? null },
  { key: "business_profit", label: "事業利益（最新月）", unit: "円", direction: "higher", resolve: (c) => c.actuals.latest?.profit ?? null },
  { key: "annual_business_income", label: "事業所得（直近12か月）", unit: "円", direction: "higher", resolve: (c) => (c.actuals.trailing12Months ? c.actuals.trailing12Profit : null) },
  { key: "active_patients", label: "継続患者数（最新月）", unit: "人", direction: "higher", resolve: (c) => c.actuals.latestActivePatients },
  { key: "new_patients", label: "新患数（最新月）", unit: "人", direction: "higher", resolve: (c) => latestVal(c, (m) => m.newPatients) },
  { key: "sessions", label: "施術件数（最新月）", unit: "件", direction: "higher", resolve: (c) => latestVal(c, (m) => m.sessions) },
  { key: "inquiries", label: "問い合わせ数（最新月）", unit: "件", direction: "higher", resolve: (c) => latestVal(c, (m) => m.inquiries) },
  { key: "ai_active_contracts", label: "AI継続契約数（最新月）", unit: "社", direction: "higher", resolve: (c) => c.actuals.latestActiveContracts },
  { key: "ai_cumulative_contracts", label: "AI導入実績（累計契約）", unit: "社", direction: "higher", resolve: (c) => (c.actuals.months.some((m) => m.newContracts != null) ? c.actuals.cumulativeContracts : null) },
  {
    key: "emergency_fund_months",
    label: "生活防衛資金（生活費の何か月分）",
    unit: "か月",
    direction: "higher",
    resolve: (c) => {
      const h = c.actuals.latestHousehold;
      const living = h?.livingCost ?? c.livingCost;
      if (!h || h.emergencyFund == null || !living) return null;
      return Math.round((h.emergencyFund / living) * 10) / 10;
    },
  },
  { key: "emergency_fund", label: "生活防衛資金（残高）", unit: "円", direction: "higher", resolve: (c) => c.actuals.latestHousehold?.emergencyFund ?? null },
  {
    key: "expense_ratio",
    label: "事業経費率（最新月）",
    unit: "%",
    direction: "lower",
    resolve: (c) => (c.actuals.latest?.expenseRatio == null ? null : Math.round(c.actuals.latest.expenseRatio * 1000) / 10),
  },
  {
    key: "profit_months",
    label: "独立基準の利益を連続達成した月数",
    unit: "か月",
    direction: "higher",
    resolve: (c) => (c.actuals.months.some((m) => m.hasData) ? consecutiveProfitMonths(c.actuals, c.today, c.profitThreshold) : null),
  },
  { key: "family_hours", label: "家族時間（最新の週間レビュー）", unit: "時間/週", direction: "higher", resolve: (c) => c.latestReview?.family_hours ?? null },
  { key: "work_hours", label: "労働時間（最新の週間レビュー）", unit: "時間/週", direction: "lower", resolve: (c) => c.latestReview?.work_hours ?? null },
];
export const KPI_SOURCE_MAP = new Map(KPI_SOURCES.map((s) => [s.key, s]));

export interface ActionEvaluation {
  kpiActual: number | null;
  kpiActualSource: "auto" | "manual" | "none";
  kpiRatio: number | null; // 達成率（0〜1）
  progress: number; // 0〜100
  status: ActionStatus;
  taskTotal: number;
  taskDone: number;
  overdue: boolean;
  daysLeft: number | null;
}

export const STATUS_LABEL: Record<ActionStatus, string> = {
  not_started: "未着手",
  in_progress: "進行中",
  achieved: "達成",
  missed: "目標未達",
};

export function kpiRatio(actual: number | null, target: number | null, direction: "higher" | "lower"): number | null {
  if (actual == null || target == null || !Number.isFinite(actual) || !Number.isFinite(target)) return null;
  if (direction === "lower") {
    if (actual <= target) return 1;
    return actual === 0 ? 1 : Math.max(0, target / actual);
  }
  if (target <= 0) return actual >= target ? 1 : 0;
  return Math.max(0, Math.min(1, actual / target));
}

/**
 * 行動の進捗と状態。
 * - KPI がある行動：進捗は KPI の達成率だけで決める（タスクを全部終えても売上目標は達成扱いにしない）
 * - KPI がない行動：手入力の進捗とタスク完了率の大きい方。ただし「達成」は利用者が達成にしたときだけ（最大 99%）
 * - 期限を過ぎて達成していなければ「目標未達」
 */
export function evaluateAction(a: MandalaAction, tasks: Task[], ctx: KpiContext): ActionEvaluation {
  const src = KPI_SOURCE_MAP.get(a.kpi_source);
  const auto = src && src.key !== "manual" ? src.resolve(ctx) : null;
  const kpiActual = auto ?? a.kpi_actual ?? null;
  const kpiActualSource: ActionEvaluation["kpiActualSource"] = auto != null ? "auto" : a.kpi_actual != null ? "manual" : "none";
  const hasKpi = a.kpi_target != null;
  const ratio = hasKpi ? kpiRatio(kpiActual, a.kpi_target, a.kpi_direction) : null;
  const related = tasks.filter((t) => t.mandala_action_id === a.id);
  const taskDone = related.filter((t) => t.status === "done").length;
  const taskTotal = related.length;
  const taskRatio = taskTotal ? taskDone / taskTotal : 0;

  let progress: number;
  let achieved: boolean;
  if (hasKpi) {
    progress = Math.round((ratio ?? 0) * 100);
    achieved = ratio != null && ratio >= 1;
  } else {
    achieved = a.status === "achieved";
    progress = achieved ? 100 : Math.min(99, Math.max(a.progress ?? 0, Math.round(taskRatio * 100)));
  }

  const daysLeft = a.due_date ? diffDays(a.due_date, ctx.today) : null;
  const overdue = daysLeft != null && daysLeft < 0 && !achieved;
  let status: ActionStatus;
  if (achieved) status = "achieved";
  else if (overdue) status = "missed";
  else if (a.status === "missed") status = "missed";
  else if (progress > 0 || a.status === "in_progress" || related.some((t) => t.status === "doing" || t.status === "done")) status = "in_progress";
  else status = "not_started";

  return { kpiActual, kpiActualSource, kpiRatio: ratio, progress, status, taskTotal, taskDone, overdue, daysLeft };
}

export interface GoalProgress {
  goal: MandalaGoal;
  progress: number;
  counts: Record<ActionStatus, number>;
}

export function goalProgress(goal: MandalaGoal, actions: MandalaAction[], evals: Map<string, ActionEvaluation>): GoalProgress {
  const own = actions.filter((a) => a.goal_id === goal.id && a.title.trim() !== "");
  const counts: Record<ActionStatus, number> = { not_started: 0, in_progress: 0, achieved: 0, missed: 0 };
  let total = 0;
  for (const a of own) {
    const e = evals.get(a.id);
    if (!e) continue;
    counts[e.status]++;
    total += e.progress;
  }
  return { goal, progress: own.length ? Math.round(total / own.length) : 0, counts };
}

/** マンダラ全体の進捗率（項目名のある行動の平均） */
export function overallMandalaProgress(actions: MandalaAction[], evals: Map<string, ActionEvaluation>): number {
  const own = actions.filter((a) => a.title.trim() !== "");
  if (!own.length) return 0;
  return Math.round(own.reduce((s, a) => s + (evals.get(a.id)?.progress ?? 0), 0) / own.length);
}

/** "A8" のようなコード */
export function actionCode(goal: MandalaGoal | undefined, a: Pick<MandalaAction, "position">): string {
  return goal && goal.code !== "CENTER" ? `${goal.code}${a.position}` : `${a.position}`;
}
