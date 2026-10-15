import { getMember, MEMBERS, MISSION_001, type MilestoneId } from "@/config/company";
import { jstDayKey, jstMonthKey } from "@/lib/time";
import type { CompanyData, DataMode } from "@/lib/types";
import { ACTIVE_TASK_STATUSES, TERMINAL_TASK_STATUSES } from "@/lib/types";

/** 実データ（保存済みの記録）から算出する指標。架空の数字は作らない。 */

export function isMemberActive(data: CompanyData, mode: DataMode, memberId: string): boolean {
  const m = getMember(memberId);
  if (!m) return false;
  return m.active || data.staffing[mode].includes(memberId);
}

export function achievedMilestones(data: CompanyData, mode: DataMode): Set<MilestoneId> {
  const set = new Set<MilestoneId>();
  for (const t of data.tasks) {
    if (t.mode === mode && t.status === "DONE" && t.milestone) set.add(t.milestone);
  }
  // 「最初の1円」は実際の入金記録でのみ達成とする（PHASE 3で売上記録を実装）
  set.delete("first-yen");
  return set;
}

export function missionProgress(data: CompanyData, mode: DataMode) {
  const achieved = achievedMilestones(data, mode);
  const total = MISSION_001.milestones.length;
  return {
    achieved: achieved.size,
    total,
    percent: Math.round((achieved.size / total) * 100),
    milestones: MISSION_001.milestones.map((m) => ({ ...m, done: achieved.has(m.id) })),
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

/** 本番の売上・利益。PHASE 3で売上記録を実装するまでは記録がないため0。 */
export function revenueTotals() {
  return { revenueThisMonth: 0, revenueTotal: 0 };
}

export function standbyMemberIds(data: CompanyData, mode: DataMode): string[] {
  return MEMBERS.filter((m) => !m.isHuman && !isMemberActive(data, mode, m.id)).map((m) => m.id);
}
