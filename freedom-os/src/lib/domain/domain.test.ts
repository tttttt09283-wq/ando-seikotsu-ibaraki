import { describe, expect, it } from "vitest";
import { buildActuals } from "./actuals";
import { evaluateCriteria, readinessRate } from "./criteria";
import { defaultSettings } from "./defaults";
import { generatePlan, interpolateKpi } from "./generator";
import { evaluateAction, goalProgress, kpiRatio, overallMandalaProgress, type KpiContext } from "./mandala";
import { buildModel, actionLinkage } from "./model";
import { rulesAdvice, buildAdvisorPayload } from "./advisor";
import { pickToday, weekStats, wouldCreateCycle } from "./tasks";
import { reviewComparisons } from "./review";
import type { BusinessRevenue, MandalaAction, MandalaGoal, Snapshot, Task } from "../types";
import { jstDate, weekStart, addMonths, diffMonths, daysInMonth } from "../date";
import { DEFAULT_ASSUMPTIONS } from "./assumptions";

const U = "u1";
const TODAY = "2026-11-15";

function action(p: Partial<MandalaAction> = {}): MandalaAction {
  return {
    id: "a1",
    user_id: U,
    goal_id: "g1",
    position: 8,
    title: "月商80万円を達成",
    description: "",
    category: "",
    priority: 1,
    due_date: "2030-06-30",
    kpi_name: "施術月商",
    kpi_target: 800000,
    kpi_actual: null,
    kpi_unit: "円",
    kpi_direction: "higher",
    kpi_source: "clinic_revenue",
    progress: 0,
    status: "not_started",
    completed_at: null,
    memo: "",
    ...p,
  };
}
function task(p: Partial<Task> = {}): Task {
  return {
    id: "t1",
    user_id: U,
    mandala_action_id: null,
    parent_id: null,
    level: "week",
    title: "タスク",
    purpose: "",
    start_date: null,
    due_date: null,
    estimate_minutes: 30,
    actual_minutes: null,
    priority: 2,
    status: "todo",
    deliverable: "",
    done_criteria: "",
    source: "manual",
    completed_at: null,
    ...p,
  };
}
const rev = (month: string, business: "clinic" | "ai", category: BusinessRevenue["category"], amount: number): BusinessRevenue => ({ id: `${month}${business}${category}`, user_id: U, month, business, category, amount, note: "" });

function ctxWith(revenue: BusinessRevenue[] = []): KpiContext {
  const actuals = buildActuals({ revenue, expenses: [], clinicMetrics: [], aiMetrics: [], household: [], taxSocialRate: 0.3 }, TODAY);
  return { actuals, today: TODAY, livingCost: 350000, profitThreshold: 300000, latestReview: null };
}

function emptySnapshot(): Snapshot {
  return {
    profile: null,
    settings: defaultSettings(U),
    goals: [],
    actions: [],
    tasks: [],
    dependencies: [],
    milestones: [],
    revenue: [],
    expenses: [],
    clinicMetrics: [],
    aiMetrics: [],
    household: [],
    scenarios: [],
    assumptions: [],
    criteria: [],
    reviews: [],
    insights: [],
  };
}

describe("日付（日本時間）", () => {
  it("UTC 15:30 は日本時間では翌日", () => {
    expect(jstDate(new Date("2026-11-14T15:30:00Z"))).toBe("2026-11-15");
    expect(jstDate(new Date("2026-11-14T14:59:00Z"))).toBe("2026-11-14");
  });
  it("週は月曜始まり・月の計算", () => {
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // 日曜 → その週の月曜
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
    expect(addMonths("2026-11-01", 3)).toBe("2027-02-01");
    expect(diffMonths("2028-04-01", "2026-11-01")).toBe(17);
    expect(daysInMonth("2028-02-01")).toBe(29);
  });
});

describe("マンダラの進捗計算", () => {
  it("KPI の達成率（多いほど良い／少ないほど良い／未入力）", () => {
    expect(kpiRatio(400000, 800000, "higher")).toBe(0.5);
    expect(kpiRatio(900000, 800000, "higher")).toBe(1);
    expect(kpiRatio(20, 25, "lower")).toBe(1);
    expect(kpiRatio(50, 25, "lower")).toBe(0.5);
    expect(kpiRatio(null, 800000, "higher")).toBeNull();
    expect(kpiRatio(5, null, "higher")).toBeNull();
  });
  it("実績から KPI を自動取得して進捗を出す", () => {
    const e = evaluateAction(action(), [], ctxWith([rev("2026-11-01", "clinic", "treatment", 400000)]));
    expect(e.kpiActual).toBe(400000);
    expect(e.kpiActualSource).toBe("auto");
    expect(e.progress).toBe(50);
    expect(e.status).toBe("in_progress");
  });
  it("タスクをすべて完了しても売上KPIは達成扱いにしない", () => {
    const tasks = [task({ id: "t1", mandala_action_id: "a1", status: "done" }), task({ id: "t2", mandala_action_id: "a1", status: "done" })];
    const e = evaluateAction(action(), tasks, ctxWith([]));
    expect(e.taskDone).toBe(2);
    expect(e.progress).toBe(0);
    expect(e.status).not.toBe("achieved");
  });
  it("KPI がない項目はタスク完了率を進捗に使うが、達成は手動のみ（最大99%）", () => {
    const noKpi = action({ kpi_target: null, kpi_source: "manual", kpi_name: "" });
    const tasks = [task({ id: "t1", mandala_action_id: "a1", status: "done" })];
    expect(evaluateAction(noKpi, tasks, ctxWith()).progress).toBe(99);
    expect(evaluateAction(noKpi, [...tasks, task({ id: "t2", mandala_action_id: "a1" })], ctxWith()).progress).toBe(50);
    expect(evaluateAction({ ...noKpi, status: "achieved" }, tasks, ctxWith()).status).toBe("achieved");
  });
  it("期限を過ぎて未達成なら「目標未達」", () => {
    const e = evaluateAction(action({ due_date: "2026-10-31" }), [], ctxWith([rev("2026-11-01", "clinic", "treatment", 100000)]));
    expect(e.status).toBe("missed");
    expect(e.overdue).toBe(true);
  });
  it("KPI 実績が目標に届けば期限前でも達成", () => {
    const e = evaluateAction(action(), [], ctxWith([rev("2026-11-01", "clinic", "treatment", 820000)]));
    expect(e.status).toBe("achieved");
    expect(e.progress).toBe(100);
  });
  it("領域・全体の進捗は行動の平均（項目名が空のマスは除く）", () => {
    const goal: MandalaGoal = { id: "g1", user_id: U, position: 1, code: "A", title: "A", description: "" };
    const acts = [action({ id: "x1", kpi_target: null, kpi_source: "manual", status: "achieved" }), action({ id: "x2", kpi_target: null, kpi_source: "manual", progress: 50 }), action({ id: "x3", title: "" })];
    const evals = new Map(acts.map((a) => [a.id, evaluateAction(a, [], ctxWith())]));
    const gp = goalProgress(goal, acts, evals);
    expect(gp.progress).toBe(75);
    expect(gp.counts.achieved).toBe(1);
    expect(overallMandalaProgress(acts, evals)).toBe(75);
  });
});

describe("タスクと今日の提案", () => {
  const evals = new Map([["a1", evaluateAction(action(), [], ctxWith())]]);
  it("最重要1＋補助2を選び、実行可能時間を超えない", () => {
    const tasks = [
      task({ id: "t1", title: "期限超過", due_date: "2026-11-10", estimate_minutes: 30 }),
      task({ id: "t2", title: "重要", priority: 1, mandala_action_id: "a1", estimate_minutes: 40 }),
      task({ id: "t3", title: "長い", estimate_minutes: 120, due_date: "2026-11-15" }),
      task({ id: "t4", title: "普通", estimate_minutes: 15 }),
      task({ id: "t5", title: "完了済み", status: "done" }),
      task({ id: "t6", title: "未来開始", start_date: "2026-12-01", priority: 1 }),
      task({ id: "t7", title: "四半期目標", level: "quarter", priority: 1 }),
    ];
    const p = pickToday(tasks, [], TODAY, 90, evals);
    expect(p.main?.task.id).toBe("t1");
    expect(p.support.map((s) => s.task.id)).toEqual(["t2", "t4"]);
    expect(p.totalMinutes).toBeLessThanOrEqual(90);
    expect(p.totalMinutes).toBe(85);
    expect(p.skippedForTime.map((s) => s.task.id)).toContain("t3");
  });
  it("依存先が未完了のタスクは提案しない", () => {
    const tasks = [task({ id: "t1", title: "後", priority: 1 }), task({ id: "t2", title: "先", priority: 3 })];
    const deps = [{ user_id: U, task_id: "t1", depends_on_task_id: "t2" }];
    expect(pickToday(tasks, deps, TODAY, 90, evals).main?.task.id).toBe("t2");
  });
  it("使える時間が0なら何も提案しない", () => {
    expect(pickToday([task()], [], TODAY, 0, evals).main).toBeNull();
  });
  it("今週の達成率（月〜日が期限）", () => {
    const w = weekStats([task({ id: "a", due_date: "2026-11-10", status: "done" }), task({ id: "b", due_date: "2026-11-15" }), task({ id: "c", due_date: "2026-11-16" })], TODAY);
    expect(w).toMatchObject({ weekStart: "2026-11-09", total: 2, done: 1, rate: 0.5 });
  });
  it("依存関係の循環を検出", () => {
    const deps = [
      { user_id: U, task_id: "b", depends_on_task_id: "a" },
      { user_id: U, task_id: "c", depends_on_task_id: "b" },
    ];
    expect(wouldCreateCycle(deps, "a", "c")).toBe(true);
    expect(wouldCreateCycle(deps, "c", "a")).toBe(false);
    expect(wouldCreateCycle(deps, "a", "a")).toBe(true);
  });
});

describe("行動計画の自動生成", () => {
  it("年間→四半期→月間→週間→今日に分解し、親子と期限が整合する", () => {
    const drafts = generatePlan(action(), "A8", TODAY, 400000);
    const levels = new Set(drafts.map((d) => d.level));
    for (const l of ["year", "quarter", "month", "week", "day"]) expect(levels.has(l as never)).toBe(true);
    const ids = new Set(drafts.map((d) => d.tempId));
    for (const d of drafts) {
      if (d.parentTempId) expect(ids.has(d.parentTempId)).toBe(true);
      expect(d.due_date >= d.start_date).toBe(true);
      expect(d.due_date <= "2030-06-30").toBe(true);
    }
    expect(drafts.find((d) => d.level === "day")?.due_date).toBe(TODAY);
  });
  it("KPI の中間目標は期限までの直線補間", () => {
    expect(interpolateKpi(0, 100, "2026-01-01", "2026-01-11", "2026-01-06")).toBe(50);
    expect(interpolateKpi(0, 100, "2026-01-01", "2026-01-11", "2027-01-01")).toBe(100);
  });
  it("期限切れの行動でも今日以降の計画を作る", () => {
    const drafts = generatePlan(action({ due_date: "2020-01-01", kpi_target: null, kpi_name: "" }), "A1", TODAY, null);
    expect(drafts.every((d) => d.due_date >= TODAY)).toBe(true);
  });
});

describe("独立条件の判定", () => {
  const base = () => {
    const s = emptySnapshot();
    s.scenarios = [{ id: "sc", user_id: U, kind: "standard", name: "標準", description: "", start_month: "2026-11-01", horizon_months: 36, is_primary: true }];
    return s;
  };
  it("実績がないと「データ不足」、達成数は参考指標", () => {
    const m = buildModel(base(), TODAY);
    const byCode = Object.fromEntries(m.criteria.map((c) => [c.code, c.status]));
    expect(byCode.profit).toBe("insufficient");
    expect(byCode.emergency_fund).toBe("insufficient");
    expect(byCode.clinic_retention).toBe("insufficient");
    expect(byCode.ai_stability).toBe("insufficient");
    expect(byCode.preparation).toBe("not_achieved");
    expect(m.criteria).toHaveLength(7);
    expect(readinessRate(m.criteria).achieved).toBe(0);
  });
  it("直近6か月の利益がすべて基準以上なら達成、1か月でも下回れば未達", () => {
    const s = base();
    const months = ["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"];
    s.revenue = months.map((m) => rev(m, "clinic", "treatment", 400000));
    expect(buildModel(s, TODAY).criteria.find((c) => c.code === "profit")?.status).toBe("achieved");
    s.revenue[2] = rev("2026-07-01", "clinic", "treatment", 100000);
    expect(buildModel(s, TODAY).criteria.find((c) => c.code === "profit")?.status).toBe("not_achieved");
  });
  it("生活防衛資金：生活費の6か月分で達成", () => {
    const s = base();
    s.household = [{ id: "h", user_id: U, month: "2026-11-01", employment_income_net: 360000, other_income: null, living_cost: 300000, emergency_fund_balance: 1800000, note: "" }];
    expect(buildModel(s, TODAY).criteria.find((c) => c.code === "emergency_fund")?.status).toBe("achieved");
    s.household[0].emergency_fund_balance = 1799999;
    expect(buildModel(s, TODAY).criteria.find((c) => c.code === "emergency_fund")?.status).toBe("not_achieved");
  });
  it("継続患者数は基準以上でも継続率が出せなければ「要確認」", () => {
    const s = base();
    s.clinicMetrics = [{ id: "c", user_id: U, month: "2026-11-01", sessions: 80, new_patients: 5, active_patients: 50, cancellations: null, available_slots: null, work_days: null, inquiries: null, sns_inflow: null, referrals: null }];
    expect(buildModel(s, TODAY).criteria.find((c) => c.code === "clinic_retention")?.status).toBe("needs_review");
    s.clinicMetrics.unshift({ ...s.clinicMetrics[0], id: "c0", month: "2026-10-01", active_patients: 50 });
    // 継続率 = (50 − 5) ÷ 50 = 90% ≥ 75%
    expect(buildModel(s, TODAY).criteria.find((c) => c.code === "clinic_retention")?.status).toBe("achieved");
  });
  it("開業準備は F1〜F5・D6 が達成でも専門家確認がなければ「要確認」", () => {
    const s = base();
    s.goals = [
      { id: "gF", user_id: U, position: 6, code: "F", title: "独立準備", description: "" },
      { id: "gD", user_id: U, position: 4, code: "D", title: "財務", description: "" },
    ];
    s.actions = [1, 2, 3, 4, 5].map((p) => action({ id: `f${p}`, goal_id: "gF", position: p, kpi_target: null, kpi_source: "manual", status: "achieved" }));
    s.actions.push(action({ id: "d6", goal_id: "gD", position: 6, kpi_target: null, kpi_source: "manual", status: "achieved" }));
    expect(buildModel(s, TODAY).criteria.find((c) => c.code === "preparation")?.status).toBe("needs_review");
    s.criteria = [{ id: "cr", user_id: U, code: "preparation", enabled: true, threshold: null, threshold2: null, manual_confirmed: true, note: "" }];
    expect(buildModel(s, TODAY).criteria.find((c) => c.code === "preparation")?.status).toBe("achieved");
  });
  it("evaluateCriteria は無効化した条件も結果に含め、達成率の分母から除く", () => {
    const s = base();
    s.criteria = [{ id: "cr", user_id: U, code: "work_hours", enabled: false, threshold: null, threshold2: null, manual_confirmed: false, note: "" }];
    const m = buildModel(s, TODAY);
    expect(m.criteria.find((c) => c.code === "work_hours")?.enabled).toBe(false);
    expect(readinessRate(m.criteria).total).toBe(6);
    void evaluateCriteria;
  });
});

describe("マンダラ ↔ 財務の連携", () => {
  it("A8（施術月商）から必要件数・顧客数・不足・見込みを出す", () => {
    const s = emptySnapshot();
    s.goals = [{ id: "g1", user_id: U, position: 1, code: "A", title: "鍼灸・整体事業", description: "" }];
    s.actions = [action()];
    s.scenarios = [{ id: "sc", user_id: U, kind: "standard", name: "標準", description: "", start_month: "2026-11-01", horizon_months: 36, is_primary: true }];
    s.revenue = [rev("2026-11-01", "clinic", "treatment", 400000)];
    s.clinicMetrics = [{ id: "c", user_id: U, month: "2026-11-01", sessions: 40, new_patients: 5, active_patients: 25, cancellations: null, available_slots: null, work_days: null, inquiries: null, sns_inflow: null, referrals: null }];
    const m = buildModel(s, TODAY);
    expect(m.codeOfAction.get("a1")).toBe("A8");
    const l = actionLinkage(m, s.actions[0]);
    const v = (label: string) => l.lines.find((x) => x.label.startsWith(label))?.value;
    expect(v("必要施術件数")).toBe(`${800000 / DEFAULT_ASSUMPTIONS.standard.clinic_price}件/月`);
    expect(v("現在の施術件数")).toBe("40件");
    expect(v("不足施術件数")).toBe("40件/月");
    expect(v("不足")).toBe("400,000円");
    expect(l.outlook).toContain("試算");
    // 実績を更新すると連携ビューも変わる
    s.revenue = [rev("2026-11-01", "clinic", "treatment", 800000)];
    const m2 = buildModel(s, TODAY);
    expect(m2.evals.get("a1")?.status).toBe("achieved");
    expect(actionLinkage(m2, s.actions[0]).onTrack).toBe(true);
  });
});

describe("AI経営参謀（ルールベース・送信データ）", () => {
  it("実績がなければ「実績データがまだありません」を最大の課題にする", () => {
    const m = buildModel(emptySnapshot(), TODAY);
    const o = rulesAdvice(m);
    expect(o.issues[0].title).toContain("実績データ");
    expect(o.issues.length).toBeLessThanOrEqual(2);
    expect(o.actions.length).toBeLessThanOrEqual(3);
    expect(o.cautions.length).toBeGreaterThan(0);
  });
  it("AI に送るデータにタスクのメモや説明・マンダラのメモを含めない", () => {
    const s = emptySnapshot();
    s.tasks = [task({ title: "期限切れ", due_date: "2026-11-01", purpose: "秘密の目的", deliverable: "患者 山田様" })];
    s.goals = [{ id: "g1", user_id: U, position: 1, code: "A", title: "A", description: "" }];
    s.actions = [action({ memo: "患者 鈴木様の記録" })];
    const json = JSON.stringify(buildAdvisorPayload(buildModel(s, TODAY), "weekly"));
    expect(json).toContain("期限切れ");
    expect(json).not.toContain("山田");
    expect(json).not.toContain("鈴木");
    expect(json).not.toContain("秘密の目的");
  });
});

describe("週間レビューの比較", () => {
  it("先週比・4週合計・目標比", () => {
    const r = (week_start: string, clinic_revenue: number) => ({ id: week_start, user_id: U, week_start, clinic_revenue, ai_revenue: 0, new_customers: 1, returning_customers: 1, ai_contracts: 0, tasks_done: 0, work_hours: 40, family_hours: 10, wins: "", issues: "", next_focus: "" });
    const c = reviewComparisons([r("2026-11-09", 100000), r("2026-11-02", 60000), r("2026-10-05", 50000)], { target_monthly_revenue: 1200000, family_hours_weekly_target: 20, max_weekly_work_hours: 32 });
    expect(c[0].review.week_start).toBe("2026-11-09");
    expect(c[0].prevWeek.revenue).toBe(40000);
    expect(c[0].month.revenue4w).toBe(160000);
    expect(c[0].month.prevRevenue4w).toBe(50000);
    expect(c[0].target.familyRatio).toBe(0.5);
    expect(c[0].target.workOver).toBe(true);
    expect(c[2].prevWeek.revenue).toBeNull();
  });
});
