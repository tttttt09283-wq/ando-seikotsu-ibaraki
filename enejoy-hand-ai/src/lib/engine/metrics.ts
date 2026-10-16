import { getMember, PRESIDENT_ID, TENANT } from "@/tenant";
import { getClinics } from "@/lib/clinics";
import { jstDayKey, jstMonthKey } from "@/lib/time";
import type { CompanyData, DataMode } from "@/lib/types";
import { ACTIVE_TASK_STATUSES, TERMINAL_TASK_STATUSES } from "@/lib/types";

/** 実データ（保存済みの記録）から算出する指標。架空の数字は作らない。 */

export function isMemberActive(data: CompanyData, mode: DataMode, memberId: string): boolean {
  const m = getMember(memberId);
  if (!m) return false;
  return m.active || data.staffing[mode].includes(memberId);
}

export function achievedMilestones(data: CompanyData, mode: DataMode): Set<string> {
  const set = new Set<string>();
  for (const ms of TENANT.mission.milestones) {
    if (ms.achievedBy === "task") {
      if (data.tasks.some((t) => t.mode === mode && t.status === "DONE" && t.milestone === ms.id)) set.add(ms.id);
    } else {
      // 承認で達成するマイルストーンは「代表の決裁で承認された」記録がある場合のみ
      const ok = data.approvals.some(
        (a) =>
          a.mode === mode &&
          a.category === ms.approvalCategory &&
          a.status === "APPROVED" &&
          a.decidedBy === PRESIDENT_ID,
      );
      if (ok) set.add(ms.id);
    }
  }
  return set;
}

export function missionProgress(data: CompanyData, mode: DataMode) {
  const achieved = achievedMilestones(data, mode);
  const total = TENANT.mission.milestones.length;
  return {
    achieved: achieved.size,
    total,
    percent: Math.round((achieved.size / total) * 100),
    milestones: TENANT.mission.milestones.map((m) => ({ id: m.id, label: m.label, done: achieved.has(m.id) })),
    label: `${achieved.size}/${total}マイルストーン`,
  };
}

export function costTotals(data: CompanyData, mode: DataMode, now: Date) {
  const day = jstDayKey(now);
  const month = jstMonthKey(now);
  let today = 0;
  let thisMonth = 0;
  let tokens = 0;
  for (const u of data.usage) {
    if (u.mode !== mode) continue;
    const d = new Date(u.at);
    if (jstMonthKey(d) === month) {
      thisMonth += u.costJpy;
      if (jstDayKey(d) === day) today += u.costJpy;
    }
    tokens += u.inputTokens + u.outputTokens;
  }
  return { today, thisMonth, tokens };
}

export function workloadByMember(data: CompanyData, mode: DataMode): Record<string, number> {
  const w: Record<string, number> = {};
  for (const t of data.tasks) {
    if (t.mode !== mode || TERMINAL_TASK_STATUSES.includes(t.status)) continue;
    w[t.assigneeId] = (w[t.assigneeId] ?? 0) + 1;
  }
  return w;
}

export function taskCounts(data: CompanyData, mode: DataMode, now: Date) {
  const day = jstDayKey(now);
  let active = 0;
  let queued = 0;
  let doneTotal = 0;
  let doneToday = 0;
  let waitingApproval = 0;
  let failed = 0;
  for (const t of data.tasks) {
    if (t.mode !== mode) continue;
    if (ACTIVE_TASK_STATUSES.includes(t.status)) active++;
    else if (t.status === "QUEUED") queued++;
    else if (t.status === "WAITING_APPROVAL") waitingApproval++;
    else if (t.status === "FAILED") failed++;
    else if (t.status === "DONE") {
      doneTotal++;
      if (t.completedAt && jstDayKey(new Date(t.completedAt)) === day) doneToday++;
    }
  }
  return { active, queued, doneTotal, doneToday, waitingApproval, failed };
}

/** 対象期間の月の一覧（YYYY-MM） */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

type MonthRecords = Pick<CompanyData, "clinicMonths">;

/**
 * その月の全院の数字。日計表の全院合計の行があればそれを使い、
 * ない指標は院の合計で補う（率・単価など合計できない指標は全院行のみ）。
 */
export function monthTotals(data: MonthRecords, month: string): { values: Record<string, number>; hasData: boolean } {
  const rows = data.clinicMonths.filter((r) => r.month === month);
  const all = rows.find((r) => r.clinicId === "all");
  const clinics = rows.filter((r) => r.clinicId !== "all");
  const values: Record<string, number> = { ...(all?.values ?? {}) };
  for (const m of TENANT.metrics) {
    if (m.total !== "sum" || values[m.key] !== undefined) continue;
    const xs = clinics.map((r) => r.values[m.key]).filter((v): v is number => v !== undefined);
    if (xs.length) values[m.key] = xs.reduce((a, b) => a + b, 0);
  }
  return { values, hasData: rows.length > 0 };
}

/** 事業計画書の月ごとの売上計画（「売上合計」の行、なければ院の行の合計） */
export function planSalesByMonth(data: Pick<CompanyData, "plan">, month: string, clinicId?: string): number | undefined {
  const rows = data.plan.filter((p) => p.month === month);
  if (clinicId) return rows.find((p) => p.clinicId === clinicId)?.amountJpy;
  const total = rows.find((p) => !p.clinicId && normalizePlanLabel(p.label).startsWith("売上合計"));
  if (total) return total.amountJpy;
  const clinicRows = rows.filter((p) => p.clinicId);
  return clinicRows.length ? clinicRows.reduce((n, p) => n + p.amountJpy, 0) : undefined;
}

export const normalizePlanLabel = (s: string) => s.normalize("NFKC").replace(/[\s\u3000]/g, "");

/** 事業計画書の損益で、画面に出す行（TENANT.planHighlights の順） */
export function planHighlightRows(data: Pick<CompanyData, "plan">) {
  const months = monthsBetween(TENANT.revenueTarget.fromMonth, TENANT.revenueTarget.toMonth);
  return TENANT.planHighlights
    .map((h) => {
      const label = data.plan.find((p) => !p.clinicId && normalizePlanLabel(p.label).startsWith(normalizePlanLabel(h)))?.label;
      if (!label) return null;
      return {
        label,
        byMonth: months.map((m) => data.plan.find((p) => p.label === label && p.month === m)?.amountJpy ?? null),
      };
    })
    .filter((x): x is { label: string; byMonth: (number | null)[] } => x !== null);
}

/**
 * 年間売上目標の進捗。人が管理する本番の数字（日計表・手入力）と事業計画だけで計算する。
 * デモの成果物の数字は一切含めない。
 * 着地見込み ＝ 過ぎた月の実績 ＋ 今月の着地予想 ＋ これからの月の事業計画
 */
export function revenueProgress(data: Pick<CompanyData, "clinicMonths" | "plan" | "clinicSetup">, now: Date) {
  const target = TENANT.revenueTarget;
  const months = monthsBetween(target.fromMonth, target.toMonth);
  const current = jstMonthKey(now);
  const elapsedMonths = months.filter((m) => m <= current).length;
  const hasPlan = data.plan.length > 0;

  const byMonth = months.map((month) => {
    const t = monthTotals(data, month);
    const plan = planSalesByMonth(data, month);
    const actual = t.hasData ? t.values.salesActual : undefined;
    const monthTarget = t.values.salesTarget ?? plan;
    const status: "past" | "current" | "future" = month < current ? "past" : month === current ? "current" : "future";
    const forecast =
      status === "past" ? actual : status === "current" ? (t.values.salesForecast ?? actual) : plan;
    return { month, status, entered: t.hasData, actualJpy: actual ?? null, targetJpy: monthTarget ?? null, planJpy: plan ?? null, forecastJpy: forecast ?? null };
  });

  const actualJpy = byMonth.reduce((n, m) => n + (m.status !== "future" ? (m.actualJpy ?? 0) : 0), 0);
  const landingJpy = byMonth.reduce((n, m) => n + (m.forecastJpy ?? 0), 0);
  const planTotalJpy = byMonth.reduce((n, m) => n + (m.planJpy ?? 0), 0);
  const knownToDate = byMonth.filter((m) => m.status !== "future").reduce((n, m) => n + (m.forecastJpy ?? 0), 0);
  const remainingMonths = months.length - elapsedMonths;
  const missingMonths = byMonth.filter((m) => m.status !== "future" && !m.entered).map((m) => m.month);

  const cur = byMonth.find((m) => m.status === "current");
  const curRecords = data.clinicMonths.filter((r) => r.month === current);
  const byClinic = getClinics(data).map((c) => {
    const v = curRecords.find((r) => r.clinicId === c.id)?.values ?? {};
    const tgt = v.salesTarget ?? planSalesByMonth(data, current, c.id);
    return {
      clinicId: c.id,
      name: c.short,
      targetJpy: tgt ?? null,
      actualJpy: v.salesActual ?? null,
      forecastJpy: v.salesForecast ?? null,
      forecastRate: tgt && v.salesForecast !== undefined ? Math.round((v.salesForecast / tgt) * 1000) / 10 : null,
    };
  });

  return {
    label: target.label,
    scope: target.scope,
    fromMonth: target.fromMonth,
    toMonth: target.toMonth,
    currentMonth: current,
    targetJpy: target.amountJpy,
    /** 過ぎた月の実績＋今月の累計実績 */
    actualJpy,
    percent: target.amountJpy ? Math.round((actualJpy / target.amountJpy) * 1000) / 10 : 0,
    /** 年間の着地見込み */
    landingJpy,
    landingPercent: target.amountJpy ? Math.round((landingJpy / target.amountJpy) * 1000) / 10 : 0,
    planTotalJpy,
    hasPlan,
    elapsedMonths,
    totalMonths: months.length,
    /** 3億円を12か月で按分した、ここまでのペース */
    paceTargetJpy: Math.round((target.amountJpy * elapsedMonths) / months.length),
    /** 3億円に届くために、残りの月で必要な月平均（今月までは見込みで計算） */
    requiredMonthlyJpy: remainingMonths > 0 ? Math.max(0, Math.round((target.amountJpy - knownToDate) / remainingMonths)) : 0,
    currentMonthTargetJpy: cur?.targetJpy ?? null,
    currentMonthActualJpy: cur?.actualJpy ?? null,
    currentMonthForecastJpy: cur?.forecastJpy ?? null,
    monthsWithData: byMonth.filter((m) => m.entered).length,
    missingMonths,
    hasData: data.clinicMonths.length > 0,
    byMonth,
    byClinic,
    currentScale: target.currentScale,
  };
}

export type IssueView = {
  id: string;
  title: string;
  detail: string;
  impact: number;
  urgency: number;
  score: number;
  status: "未着手" | "対応中" | "成果物あり";
  doneTasks: number;
  openTasks: number;
};

/** 課題の優先順位（影響×緊急度）と、実際のTaskから判定した対応状況 */
export function issueViews(data: CompanyData, mode: DataMode): IssueView[] {
  const projects = data.projects.filter((p) => p.mode === mode);
  return TENANT.issues
    .map((issue): IssueView => {
      const projectIds = new Set(projects.filter((p) => p.issueIds.includes(issue.id)).map((p) => p.id));
      const tasks = data.tasks.filter(
        (t) => t.mode === mode && (projectIds.has(t.projectId) || issue.intents.includes(t.intent)),
      );
      const doneTasks = tasks.filter((t) => t.status === "DONE").length;
      const openTasks = tasks.filter((t) => !TERMINAL_TASK_STATUSES.includes(t.status)).length;
      return {
        id: issue.id,
        title: issue.title,
        detail: issue.detail,
        impact: issue.impact,
        urgency: issue.urgency,
        score: issue.impact * issue.urgency,
        status: openTasks > 0 ? "対応中" : doneTasks > 0 ? "成果物あり" : "未着手",
        doneTasks,
        openTasks,
      };
    })
    .sort((a, b) => b.score - a.score || b.impact - a.impact);
}

export function standbyMemberIds(data: CompanyData, mode: DataMode): string[] {
  return TENANT.members.filter((m) => !m.isHuman && !isMemberActive(data, mode, m.id)).map((m) => m.id);
}
