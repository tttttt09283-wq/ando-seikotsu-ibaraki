import type { Limits } from "@/config/limits";
import {
  costTotals,
  isMemberActive,
  issueViews,
  missionProgress,
  planHighlightRows,
  revenueProgress,
  taskCounts,
} from "@/lib/engine/metrics";
import type { Tier } from "@/lib/tenant-types";
import {
  ACTIVE_TASK_STATUSES,
  type Activity,
  type AgentStatus,
  type Approval,
  type AuditEntry,
  type ChatMessage,
  type Command,
  type CompanyData,
  type DataMode,
  type Project,
  type SafetyState,
  type ClinicMonthRecord,
  type DataSourceState,
  type PlanRecord,
  type Task,
  type TaskStatus,
} from "@/lib/types";
import { COMMANDER_ID, PRESIDENT_ID, TENANT } from "@/tenant";

/** 画面に渡すスナップショット。すべて保存データから算出する（架空の稼働・数字は作らない）。 */

export type MemberView = {
  id: string;
  name: string;
  kana?: string;
  title: string;
  tier: Tier;
  teamId: string;
  teamName: string;
  reportsTo: string | null;
  isHuman: boolean;
  active: boolean;
  status: AgentStatus | "HUMAN";
  statusDetail: string;
  currentTask: { id: string; title: string; status: TaskStatus } | null;
  activeTaskCount: number;
  completedCount: number;
  lastActiveAt: string | null;
  usage: { tokens: number; costJpy: number };
  skills: string[];
  dailyTaskLimit: number;
  persona?: string;
};

export type PipelineStage =
  | "received"
  | "analyzing"
  | "planned"
  | "assigned"
  | "executing"
  | "reviewing"
  | "reporting"
  | "done";

export const PIPELINE_STAGES: { id: PipelineStage; label: string }[] = [
  { id: "received", label: "受信" },
  { id: "analyzing", label: "司令塔の判断" },
  { id: "planned", label: "Project・Task分解" },
  { id: "assigned", label: "割当" },
  { id: "executing", label: "実行" },
  { id: "reviewing", label: "レビュー" },
  { id: "reporting", label: "集約" },
  { id: "done", label: "報告" },
];

export type CommandView = Command & { stage: PipelineStage; taskIds: string[] };

export type CompanySnapshot = {
  generatedAt: string;
  mode: DataMode;
  mission: ReturnType<typeof missionProgress>;
  revenue: ReturnType<typeof revenueProgress>;
  issues: ReturnType<typeof issueViews>;
  kpis: {
    aiCostTodayJpy: number;
    aiCostMonthJpy: number;
    aiCostEstimated: boolean;
    dailyBudgetJpy: number;
    monthlyBudgetJpy: number;
    activeTasks: number;
    queuedTasks: number;
    doneTasks: number;
    doneToday: number;
    waitingApprovalTasks: number;
    pendingApprovals: number;
    pendingForOperator: number;
    pendingForPresident: number;
  };
  commanderMessage: ChatMessage | null;
  members: MemberView[];
  commands: CommandView[];
  projects: Project[];
  tasks: Task[];
  messages: ChatMessage[];
  activities: Activity[];
  approvals: Approval[];
  /** 院の数字（今年度分・本番の数字） */
  clinicMonths: ClinicMonthRecord[];
  /** 事業計画書：院の売上計画の行 */
  clinicPlan: PlanRecord[];
  /** 事業計画書：損益の主な行 */
  planRows: ReturnType<typeof planHighlightRows>;
  dataSources: DataSourceState;
  /** 監査ログ（新しい順・統括責任者のみ） */
  audit: AuditEntry[];
  safety: SafetyState;
  /** 処理中の仕事があるか（画面の更新間隔の判断に使う） */
  busy: boolean;
};

const STATUS_PRIORITY: AgentStatus[] = ["ERROR", "WORKING", "THINKING", "REVIEWING", "WAITING_APPROVAL", "IDLE"];

function pickStatus(candidates: { status: AgentStatus; detail: string; task?: Task }[]) {
  for (const s of STATUS_PRIORITY) {
    const hit = candidates.find((c) => c.status === s);
    if (hit) return hit;
  }
  return { status: "IDLE" as AgentStatus, detail: "待機中（指示待ち）", task: undefined };
}

export function deriveMemberViews(data: CompanyData, mode: DataMode): MemberView[] {
  const tasks = data.tasks.filter((t) => t.mode === mode);
  const commands = data.commands.filter((c) => c.mode === mode);
  const activities = data.activities.filter((a) => a.mode === mode);
  const approvals = data.approvals.filter((a) => a.mode === mode && a.status === "PENDING");

  const lastActive = new Map<string, string>();
  for (const a of activities) {
    if (!lastActive.has(a.actorId) || lastActive.get(a.actorId)! < a.at) lastActive.set(a.actorId, a.at);
  }
  const usage = new Map<string, { tokens: number; costJpy: number }>();
  for (const u of data.usage) {
    if (u.mode !== mode) continue;
    const cur = usage.get(u.memberId) ?? { tokens: 0, costJpy: 0 };
    cur.tokens += u.inputTokens + u.outputTokens;
    cur.costJpy = Math.round((cur.costJpy + u.costJpy) * 100) / 100;
    usage.set(u.memberId, cur);
  }

  return TENANT.members.map((m): MemberView => {
    const base = {
      id: m.id,
      name: m.name,
      kana: m.kana,
      title: m.title,
      tier: m.tier,
      teamId: m.teamId,
      teamName: TENANT.teams.find((t) => t.id === m.teamId)?.name ?? m.teamId,
      reportsTo: m.reportsTo,
      isHuman: Boolean(m.isHuman),
      skills: m.skills,
      dailyTaskLimit: m.dailyTaskLimit,
      persona: m.persona,
      lastActiveAt: lastActive.get(m.id) ?? null,
      usage: usage.get(m.id) ?? { tokens: 0, costJpy: 0 },
    };
    const active = isMemberActive(data, mode, m.id);

    if (m.isHuman) {
      const mine = approvals.filter((a) => (a.currentApprover === "president") === (m.tier === "president")).length;
      return {
        ...base,
        active: true,
        status: "HUMAN",
        statusDetail: mine ? `判断待ち ${mine}件` : "判断待ちなし",
        currentTask: null,
        activeTaskCount: 0,
        completedCount: 0,
      };
    }

    const assigned = tasks.filter((t) => t.assigneeId === m.id);
    const completedCount = assigned.filter((t) => t.status === "DONE").length;
    const cands: { status: AgentStatus; detail: string; task?: Task }[] = [];

    for (const t of assigned) {
      if (t.status === "THINKING") cands.push({ status: "THINKING", detail: "方針を検討中", task: t });
      if (t.status === "WORKING") cands.push({ status: "WORKING", detail: t.revisionCount ? "修正版を作成中" : "成果物を作成中", task: t });
      if (t.status === "REVISION") cands.push({ status: "WORKING", detail: "修正依頼を確認中", task: t });
      if (t.status === "WAITING_APPROVAL") cands.push({ status: "WAITING_APPROVAL", detail: "承認待ち", task: t });
      if (t.status === "FAILED" && !commands.find((c) => c.id === t.commandId && c.status === "COMPLETED")) {
        cands.push({ status: "ERROR", detail: t.error ?? "エラー", task: t });
      }
    }
    for (const t of tasks) {
      if (t.reviewerId === m.id && t.status === "IN_REVIEW") cands.push({ status: "REVIEWING", detail: "成果物をレビュー中", task: t });
    }
    if (m.tier === "leader") {
      const supervised = tasks.filter((t) => t.reviewerId === m.id && ACTIVE_TASK_STATUSES.includes(t.status) && t.status !== "IN_REVIEW");
      if (supervised.length) {
        cands.push({ status: "WORKING", detail: `チームのTaskを監督中（${supervised.length}件）`, task: supervised[0] });
      }
    }
    if (m.id === COMMANDER_ID) {
      const analyzing = commands.find((c) => c.status === "ANALYZING");
      const reporting = commands.find((c) => c.status === "REPORTING");
      if (analyzing) cands.push({ status: "THINKING", detail: `指示を分析中：「${analyzing.text}」` });
      if (reporting) cands.push({ status: "WORKING", detail: "成果を集約して報告を作成中" });
      const running = commands.filter((c) => c.status === "RUNNING").length;
      if (running) cands.push({ status: "WORKING", detail: `${running}件の指示を指揮中` });
      if (approvals.length) cands.push({ status: "WAITING_APPROVAL", detail: `承認待ち ${approvals.length}件` });
    }

    const activeTaskCount = assigned.filter((t) => ACTIVE_TASK_STATUSES.includes(t.status)).length;

    if (!active) {
      return {
        ...base,
        active,
        status: "STANDBY",
        statusDetail: "待機中（有効化には承認が必要）",
        currentTask: null,
        activeTaskCount,
        completedCount,
      };
    }
    const picked = pickStatus(cands);
    return {
      ...base,
      active,
      status: picked.status,
      statusDetail: picked.detail,
      currentTask: picked.task ? { id: picked.task.id, title: picked.task.title, status: picked.task.status } : null,
      activeTaskCount,
      completedCount,
    };
  });
}

function stageOf(c: Command, tasks: Task[]): PipelineStage {
  switch (c.status) {
    case "ANALYZING":
      return "analyzing";
    case "REPORTING":
      return "reporting";
    case "COMPLETED":
    case "ANSWERED":
      return "done";
    case "FAILED":
    case "BLOCKED":
      return "received";
    case "RUNNING": {
      const mine = tasks.filter((t) => t.commandId === c.id);
      if (mine.some((t) => t.status === "IN_REVIEW" || t.status === "REVISION")) return "reviewing";
      if (mine.some((t) => t.status !== "QUEUED")) return "executing";
      return "assigned";
    }
  }
}

export function buildSnapshot(data: CompanyData, mode: DataMode, now: Date, limits: Limits): CompanySnapshot {
  const counts = taskCounts(data, mode, now);
  const cost = costTotals(data, mode, now);
  const commands = data.commands.filter((c) => c.mode === mode).slice(-20);
  const commandIds = new Set(commands.map((c) => c.id));
  const tasks = data.tasks.filter((t) => t.mode === mode && commandIds.has(t.commandId));
  const messages = data.messages.filter((m) => m.mode === mode).slice(-120);
  const pendingApprovals = data.approvals.filter((a) => a.mode === mode && a.status === "PENDING");
  const commanderMessage = [...messages].reverse().find((m) => m.role === "commander") ?? null;

  return {
    generatedAt: now.toISOString(),
    mode,
    mission: missionProgress(data, mode),
    revenue: revenueProgress(data, now),
    issues: issueViews(data, mode),
    kpis: {
      aiCostTodayJpy: Math.round(cost.today * 100) / 100,
      aiCostMonthJpy: Math.round(cost.thisMonth * 100) / 100,
      aiCostEstimated: mode === "demo",
      dailyBudgetJpy: limits.dailyBudgetJpy,
      monthlyBudgetJpy: limits.monthlyBudgetJpy,
      activeTasks: counts.active,
      queuedTasks: counts.queued,
      doneTasks: counts.doneTotal,
      doneToday: counts.doneToday,
      waitingApprovalTasks: counts.waitingApproval,
      pendingApprovals: pendingApprovals.length,
      pendingForOperator: pendingApprovals.filter((a) => a.currentApprover === "operator").length,
      pendingForPresident: pendingApprovals.filter((a) => a.currentApprover === "president").length,
    },
    commanderMessage,
    members: deriveMemberViews(data, mode),
    commands: commands.map((c) => ({
      ...c,
      stage: stageOf(c, tasks),
      taskIds: tasks.filter((t) => t.commandId === c.id).sort((a, b) => a.order - b.order).map((t) => t.id),
    })),
    projects: data.projects.filter((p) => p.mode === mode && commandIds.has(p.commandId)),
    tasks,
    messages,
    activities: data.activities.filter((a) => a.mode === mode).slice(-200),
    approvals: data.approvals
      .filter((a) => a.mode === mode)
      .sort((a, b) => (a.status === "PENDING" ? -1 : 0) - (b.status === "PENDING" ? -1 : 0) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 40),
    clinicMonths: data.clinicMonths.filter(
      (r) => r.month >= TENANT.revenueTarget.fromMonth && r.month <= TENANT.revenueTarget.toMonth,
    ),
    clinicPlan: data.plan.filter((p) => p.clinicId),
    planRows: planHighlightRows(data),
    dataSources: data.dataSources,
    audit: data.audit.slice(-150).reverse(),
    safety: data.safety,
    busy:
      !data.safety.halted &&
      (commands.some((c) => ["ANALYZING", "RUNNING", "REPORTING"].includes(c.status)) || counts.active + counts.queued > 0),
  };
}

/** 代表用：自分宛ての承認依頼と、判断に必要な最小限の会社の状況だけを返す */
export type PresidentSnapshot = {
  generatedAt: string;
  mode: DataMode;
  pending: Approval[];
  decided: Approval[];
  mission: { code: string; title: string; percent: number; label: string };
  revenue: { label: string; actualJpy: number; targetJpy: number; percent: number; hasData: boolean; landingJpy: number; landingPercent: number };
};

export function buildPresidentSnapshot(data: CompanyData, mode: DataMode, now: Date): PresidentSnapshot {
  const mine = data.approvals.filter((a) => a.mode === mode);
  const progress = missionProgress(data, mode);
  const revenue = revenueProgress(data, now);
  return {
    generatedAt: now.toISOString(),
    mode,
    pending: mine
      .filter((a) => a.status === "PENDING" && a.currentApprover === "president")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    decided: mine
      .filter((a) => a.decidedBy === PRESIDENT_ID || a.history.some((h) => h.actor === PRESIDENT_ID))
      .filter((a) => !(a.status === "PENDING" && a.currentApprover === "president"))
      .sort((a, b) => (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt))
      .slice(0, 10),
    mission: { code: TENANT.mission.code, title: TENANT.mission.title, percent: progress.percent, label: progress.label },
    revenue: {
      label: revenue.label,
      actualJpy: revenue.actualJpy,
      targetJpy: revenue.targetJpy,
      percent: revenue.percent,
      hasData: revenue.hasData,
      landingJpy: revenue.landingJpy,
      landingPercent: revenue.landingPercent,
    },
  };
}
