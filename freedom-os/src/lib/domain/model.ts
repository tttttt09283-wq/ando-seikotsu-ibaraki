// スナップショット（ユーザーの全データ）から、各画面で使う計算結果をまとめて作る。
// ここが「マンダラ・財務・タスク・ロードマップ」を相互につなぐ中心。
import { addMonths, diffDays, diffMonths, monthOf } from "../date";
import type { FinancialScenario, MandalaAction, MandalaGoal, ScenarioKind, Snapshot, WeeklyReview } from "../types";
import { buildActuals, recentMonths, type ActualMonth, type ActualsSummary } from "./actuals";
import { mergeAssumptions, type Assumptions } from "./assumptions";
import { requiredContracts, requiredMonthlyNew, requiredPatients, safeNum } from "./calc";
import { evaluateCriteria, readinessRate, type CriterionResult, criterionConfig } from "./criteria";
import { actionCode, evaluateAction, goalProgress, overallMandalaProgress, type ActionEvaluation, type GoalProgress, type KpiContext } from "./mandala";
import { firstMonthReaching, projectScenario, scenarioExpectation, type ProjectionRow, type ScenarioExpectation } from "./projection";
import { overdueTasks, pickToday, weekStats, type TodayPlan, type WeekStats } from "./tasks";

export interface ScenarioModel {
  scenario: FinancialScenario;
  assumptions: Assumptions;
  rows: ProjectionRow[];
  expectation: ScenarioExpectation;
}

export interface AppModel {
  today: string;
  snapshot: Snapshot;
  actuals: ActualsSummary;
  recent6: ActualMonth[];
  current: ActualMonth | null; // 最新の実績月
  latestReview: WeeklyReview | null;
  evals: Map<string, ActionEvaluation>;
  goalProgress: GoalProgress[];
  mandalaProgress: number;
  goalByCode: Map<string, MandalaGoal>;
  actionByCode: Map<string, MandalaAction>;
  codeOfAction: Map<string, string>;
  scenarios: ScenarioModel[];
  primary: ScenarioModel | null;
  criteria: CriterionResult[];
  readiness: { achieved: number; total: number; rate: number };
  todayPlan: TodayPlan;
  week: WeekStats;
  overdue: Snapshot["tasks"];
  daysToIndependence: number;
  employmentIncome: number;
  kpiContext: KpiContext;
}

const KIND_ORDER: ScenarioKind[] = ["conservative", "standard", "challenge"];

export function buildModel(s: Snapshot, today: string): AppModel {
  const st = s.settings;
  const actuals = buildActuals(
    { revenue: s.revenue, expenses: s.expenses, clinicMetrics: s.clinicMetrics, aiMetrics: s.aiMetrics, household: s.household, taxSocialRate: st.tax_social_rate },
    today,
  );
  const latestReview = [...s.reviews].sort((a, b) => b.week_start.localeCompare(a.week_start))[0] ?? null;
  const profitThreshold = criterionConfig(s.criteria, "profit").threshold ?? 0;
  const kpiContext: KpiContext = { actuals, today, livingCost: st.living_cost_monthly, profitThreshold, latestReview };

  const evals = new Map<string, ActionEvaluation>();
  for (const a of s.actions) evals.set(a.id, evaluateAction(a, s.tasks, kpiContext));
  const goalsSorted = [...s.goals].sort((a, b) => a.position - b.position);
  const gp = goalsSorted.filter((g) => g.code !== "CENTER").map((g) => goalProgress(g, s.actions, evals));
  const goalByCode = new Map(s.goals.map((g) => [g.code, g]));
  const goalById = new Map(s.goals.map((g) => [g.id, g]));
  const actionByCode = new Map<string, MandalaAction>();
  const codeOfAction = new Map<string, string>();
  for (const a of s.actions) {
    const c = actionCode(goalById.get(a.goal_id), a);
    actionByCode.set(c, a);
    codeOfAction.set(a.id, c);
  }

  // シナリオ試算（常に今月から）
  const thisMonth = monthOf(today);
  const scenarios: ScenarioModel[] = [...s.scenarios]
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .map((sc) => {
      const assumptions = mergeAssumptions(sc.kind, s.assumptions.filter((x) => x.scenario_id === sc.id));
      const rows = projectScenario(assumptions, {
        startMonth: thisMonth,
        months: sc.horizon_months,
        independenceDate: st.independence_target_date,
        taxSocialRate: st.tax_social_rate,
        livingCost: st.living_cost_monthly,
        employmentTakehome: st.employment_monthly_takehome,
        employmentWeeklyHours: st.employment_weekly_hours,
        weeklyDiscretionaryHours: st.weekly_discretionary_hours,
        initialBalance: actuals.latestHousehold?.emergencyFund ?? null,
        initialActivePatients: actuals.latestActivePatients,
        initialContracts: actuals.latestActiveContracts,
      });
      const clinicCfg = criterionConfig(s.criteria, "clinic_retention");
      const aiCfg = criterionConfig(s.criteria, "ai_stability");
      const expectation = scenarioExpectation(rows, {
        independenceDate: st.independence_target_date,
        profitThreshold,
        emergencyMonths: st.emergency_fund_months_min,
        livingCost: st.living_cost_monthly,
        activePatientsMin: clinicCfg.threshold ?? 0,
        contractsMin: aiCfg.threshold ?? 0,
        maxWeeklyHours: st.max_weekly_work_hours,
      });
      return { scenario: sc, assumptions, rows, expectation };
    });
  const primary = scenarios.find((x) => x.scenario.is_primary) ?? scenarios.find((x) => x.scenario.kind === "standard") ?? scenarios[0] ?? null;

  const criteria = evaluateCriteria({
    today,
    settings: st,
    criteria: s.criteria,
    actuals,
    goals: s.goals,
    actions: s.actions,
    evals,
    primaryProjection: primary?.rows ?? null,
  });

  return {
    today,
    snapshot: s,
    actuals,
    recent6: recentMonths(actuals, today, 6),
    current: actuals.latest,
    latestReview,
    evals,
    goalProgress: gp,
    mandalaProgress: overallMandalaProgress(s.actions, evals),
    goalByCode,
    actionByCode,
    codeOfAction,
    scenarios,
    primary,
    criteria,
    readiness: readinessRate(criteria),
    todayPlan: pickToday(s.tasks, s.dependencies, today, st.daily_available_minutes, evals),
    week: weekStats(s.tasks, today),
    overdue: overdueTasks(s.tasks, today),
    daysToIndependence: diffDays(st.independence_target_date, today),
    employmentIncome: actuals.latestHousehold?.employmentIncome ?? st.employment_monthly_takehome,
    kpiContext,
  };
}

// ---------------------------------------------------------------------------
// マンダラ項目 → 財務・顧客数・行動の連携ビュー
// ---------------------------------------------------------------------------
export interface LinkLine {
  label: string;
  value: string;
  kind: "actual" | "sim" | "calc" | "target";
}
export interface ActionLinkage {
  lines: LinkLine[];
  projectionMonth: string | null;
  onTrack: boolean | null;
  outlook: string;
}

const yenS = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${Math.round(v).toLocaleString("ja-JP")}円`);
const n1 = (v: number | null | undefined, unit: string) => (v == null || !Number.isFinite(v) ? "—" : `${(Math.round(v * 10) / 10).toLocaleString("ja-JP")}${unit}`);

function rolling12(rows: ProjectionRow[], actuals: ActualsSummary, today: string): { month: string; value: number }[] {
  // 実績（直近）＋試算をつないだ12か月移動合計。試算開始月以前は実績を使う
  const thisMonth = monthOf(today);
  const series = rows.map((r) => ({ month: r.month, profit: r.profit }));
  return series.map((r, i) => {
    let total = 0;
    for (let k = 0; k < 12; k++) {
      const idx = i - k;
      if (idx >= 0) total += series[idx].profit;
      else {
        const m = addMonths(thisMonth, idx);
        total += actuals.byMonth.get(m)?.profit ?? 0;
      }
    }
    return { month: r.month, value: total };
  });
}

export function actionLinkage(m: AppModel, a: MandalaAction): ActionLinkage {
  const e = m.evals.get(a.id);
  const lines: LinkLine[] = [];
  const target = a.kpi_target;
  const due = a.due_date;
  const p = m.primary;
  const asm = p?.assumptions;
  const rows = p?.rows ?? [];
  let projectionMonth: string | null = null;
  const cur = e?.kpiActual ?? null;

  if (target != null) {
    lines.push({ label: `現在の${a.kpi_name || "実績"}`, value: a.kpi_unit === "円" ? yenS(cur) : n1(cur, a.kpi_unit), kind: "actual" });
    lines.push({ label: "目標", value: a.kpi_unit === "円" ? yenS(target) : n1(target, a.kpi_unit), kind: "target" });
    if (cur != null) {
      const gap = a.kpi_direction === "lower" ? cur - target : target - cur;
      lines.push({ label: a.kpi_direction === "lower" ? "目標までの超過分" : "不足", value: a.kpi_unit === "円" ? yenS(Math.max(0, gap)) : n1(Math.max(0, gap), a.kpi_unit), kind: "calc" });
    }
  }

  const monthsLeft = due ? Math.max(1, diffMonths(due, m.today)) : null;
  switch (a.kpi_source) {
    case "clinic_revenue": {
      if (asm && target != null) {
        const price = asm.clinic_price;
        const freq = asm.clinic_visit_frequency;
        const needSessions = price > 0 ? Math.ceil(target / price) : null;
        const needPatients = needSessions == null ? null : requiredPatients(needSessions, freq);
        const curSessions = m.actuals.latest?.sessions ?? null;
        const curActive = m.actuals.latestActivePatients;
        lines.push({ label: `必要施術件数（単価 ${price.toLocaleString("ja-JP")}円）`, value: n1(needSessions, "件/月"), kind: "calc" });
        lines.push({ label: `必要顧客数（来院 ${freq}回/月）`, value: n1(needPatients == null ? null : Math.ceil(needPatients), "人"), kind: "calc" });
        lines.push({ label: "現在の施術件数", value: n1(curSessions, "件"), kind: "actual" });
        lines.push({ label: "現在の継続患者数", value: n1(curActive, "人"), kind: "actual" });
        if (needSessions != null && curSessions != null) lines.push({ label: "不足施術件数", value: n1(Math.max(0, needSessions - curSessions), "件/月"), kind: "calc" });
        if (needPatients != null) {
          const needNew = monthsLeft ? requiredMonthlyNew(needPatients, curActive ?? 0, asm.clinic_retention_rate, monthsLeft) : null;
          lines.push({ label: `期限までに必要な新患数（継続率 ${(asm.clinic_retention_rate * 100).toFixed(0)}%）`, value: n1(needNew, "人/月"), kind: "calc" });
        }
        projectionMonth = firstMonthReaching(rows, (r) => r.clinicRevenue, target);
      }
      break;
    }
    case "ai_revenue": {
      if (asm && target != null) {
        const productNow = rows[0]?.aiProductRevenue ?? 0;
        const need = requiredContracts(target, asm.ai_monthly_fee, productNow);
        lines.push({ label: `必要継続契約数（月額 ${asm.ai_monthly_fee.toLocaleString("ja-JP")}円）`, value: n1(need, "社"), kind: "calc" });
        lines.push({ label: "現在の継続契約数", value: n1(m.actuals.latestActiveContracts, "社"), kind: "actual" });
        if (need != null && m.actuals.latestActiveContracts != null) lines.push({ label: "不足契約数", value: n1(Math.max(0, need - m.actuals.latestActiveContracts), "社"), kind: "calc" });
        if (need != null && monthsLeft) {
          const nn = requiredMonthlyNew(need, m.actuals.latestActiveContracts ?? 0, 1 - asm.ai_churn_rate, monthsLeft);
          lines.push({ label: `期限までに必要な新規契約（解約率 ${(asm.ai_churn_rate * 100).toFixed(0)}%）`, value: n1(nn, "社/月"), kind: "calc" });
        }
        projectionMonth = firstMonthReaching(rows, (r) => r.aiRevenue, target);
      }
      break;
    }
    case "total_revenue":
      if (target != null) projectionMonth = firstMonthReaching(rows, (r) => r.totalRevenue, target);
      break;
    case "business_profit":
      if (target != null) projectionMonth = firstMonthReaching(rows, (r) => r.profit, target);
      break;
    case "annual_business_income":
      if (target != null) {
        const r12 = rolling12(rows, m.actuals, m.today);
        projectionMonth = r12.find((r) => r.value >= target)?.month ?? null;
        lines.push({ label: "必要な月平均の事業利益", value: yenS(target / 12), kind: "calc" });
      }
      break;
    case "active_patients":
      if (asm && target != null && monthsLeft) {
        const nn = requiredMonthlyNew(target, m.actuals.latestActivePatients ?? 0, asm.clinic_retention_rate, monthsLeft);
        lines.push({ label: "期限までに必要な新患数", value: n1(nn, "人/月"), kind: "calc" });
        projectionMonth = firstMonthReaching(rows, (r) => r.clinicActive, target);
      }
      break;
    case "ai_cumulative_contracts":
    case "ai_active_contracts":
      if (target != null && monthsLeft) {
        const curC = a.kpi_source === "ai_active_contracts" ? m.actuals.latestActiveContracts ?? 0 : m.actuals.cumulativeContracts;
        lines.push({ label: "期限までに必要な新規契約", value: n1(Math.max(0, target - curC) / monthsLeft, "社/月"), kind: "calc" });
        if (a.kpi_source === "ai_active_contracts") projectionMonth = firstMonthReaching(rows, (r) => r.aiContracts, target);
        else {
          let cum = m.actuals.cumulativeContracts;
          projectionMonth = rows.find((r) => (cum += r.aiNew) >= target)?.month ?? null;
        }
      }
      break;
    case "emergency_fund_months":
      if (target != null) {
        const living = m.actuals.latestHousehold?.livingCost ?? m.snapshot.settings.living_cost_monthly;
        const bal = m.actuals.latestHousehold?.emergencyFund ?? null;
        const need = living * target;
        lines.push({ label: "必要な生活防衛資金", value: yenS(need), kind: "calc" });
        lines.push({ label: "現在の残高", value: yenS(bal), kind: "actual" });
        if (bal != null && monthsLeft) lines.push({ label: "期限までに必要な月間貯蓄", value: yenS(Math.max(0, need - bal) / monthsLeft), kind: "calc" });
        projectionMonth = firstMonthReaching(rows, (r) => r.balance, need);
      }
      break;
  }

  if (due) lines.push({ label: "期限", value: `${due}（${e?.daysLeft != null ? (e.daysLeft >= 0 ? `あと${e.daysLeft}日` : `${-e.daysLeft}日超過`) : ""}）`, kind: "target" });

  let onTrack: boolean | null = null;
  let outlook = "";
  if (e?.status === "achieved") {
    onTrack = true;
    outlook = "達成済み（実績値で確認）";
  } else if (projectionMonth != null) {
    onTrack = due ? projectionMonth <= monthOf(due) : null;
    outlook = `主シナリオ（${p?.scenario.name ?? ""}）の試算では ${projectionMonth.slice(0, 4)}年${Number(projectionMonth.slice(5, 7))}月に到達${onTrack === false ? "。期限には間に合わない見込み" : onTrack ? "。期限内に到達する見込み" : ""}`;
  } else if (["clinic_revenue", "ai_revenue", "total_revenue", "business_profit", "annual_business_income", "active_patients", "ai_active_contracts", "ai_cumulative_contracts", "emergency_fund_months"].includes(a.kpi_source) && target != null) {
    onTrack = false;
    outlook = `主シナリオの試算期間（${rows.length}か月）内には到達しない見込み。前提値の見直しが必要`;
  } else {
    outlook = target != null ? "この指標は試算と連動していません。実績値を入力して確認してください" : "数値KPIがない項目です。タスクの完了と自己評価で進めます";
  }
  return { lines, projectionMonth, onTrack, outlook };
}

/** 安全な数値取得（UI 用） */
export const n = (v: unknown) => safeNum(v);
