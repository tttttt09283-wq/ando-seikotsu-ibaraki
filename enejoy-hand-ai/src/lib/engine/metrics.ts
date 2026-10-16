import { getMember, PRESIDENT_ID, TENANT } from "@/tenant";
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

/**
 * 売上目標の進捗。人が手入力した本番の実績（data.sales）だけで計算する。
 * デモの成果物の数字は一切含めない。
 */
export function revenueProgress(data: CompanyData, now: Date) {
  const target = TENANT.revenueTarget;
  const months = monthsBetween(target.fromMonth, target.toMonth);
  const current = jstMonthKey(now);
  const elapsedMonths = months.filter((m) => m <= current).length;
  const inRange = data.sales.filter((s) => months.includes(s.month));

  const byUnit = TENANT.businessUnits.map((u) => {
    const rows = inRange.filter((s) => s.unitId === u.id);
    return {
      unitId: u.id,
      name: u.short,
      actualJpy: rows.reduce((n, s) => n + s.amountJpy, 0),
      targetJpy: target.byUnitJpy[u.id] ?? null,
      thisMonthJpy: rows.filter((s) => s.month === current).reduce((n, s) => n + s.amountJpy, 0),
      newPatients: rows.reduce((n, s) => n + (s.newPatients ?? 0), 0),
      repeatPatients: rows.reduce((n, s) => n + (s.repeatPatients ?? 0), 0),
    };
  });
  const actualJpy = byUnit.reduce((n, u) => n + u.actualJpy, 0);
  const monthsWithData = months.filter((m) => inRange.some((s) => s.month === m));
  const remainingMonths = months.length - elapsedMonths;
  const paceTargetJpy = Math.round((target.amountJpy * elapsedMonths) / months.length);

  return {
    label: target.label,
    scope: target.scope,
    fromMonth: target.fromMonth,
    toMonth: target.toMonth,
    targetJpy: target.amountJpy,
    actualJpy,
    percent: target.amountJpy ? Math.round((actualJpy / target.amountJpy) * 1000) / 10 : 0,
    elapsedMonths,
    totalMonths: months.length,
    paceTargetJpy,
    /** 残り期間で必要な月平均（実績が入っている前提） */
    requiredMonthlyJpy: remainingMonths > 0 ? Math.max(0, Math.round((target.amountJpy - actualJpy) / remainingMonths)) : 0,
    monthsWithData: monthsWithData.length,
    /** 経過月のうち未入力の月 */
    missingMonths: months.filter((m) => m <= current && !monthsWithData.includes(m)),
    hasData: inRange.length > 0,
    byUnit,
    byMonth: months.map((m) => ({
      month: m,
      totalJpy: inRange.filter((s) => s.month === m).reduce((n, s) => n + s.amountJpy, 0),
      entered: inRange.some((s) => s.month === m),
    })),
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
