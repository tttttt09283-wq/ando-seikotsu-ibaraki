import { randomUUID } from "node:crypto";
import {
  EXECUTIVE_BY_DEPARTMENT,
  getMember,
  MISSION_001,
  REVIEWER_BY_DEPARTMENT,
} from "@/config/company";
import type { Limits } from "@/config/limits";
import type { CompanyStore } from "@/lib/store/store";
import { jstDayKey } from "@/lib/time";
import {
  ACTIVE_TASK_STATUSES,
  TERMINAL_TASK_STATUSES,
  type Activity,
  type Approval,
  type Command,
  type CommandInput,
  type CompanyData,
  type DataMode,
  type Task,
} from "@/lib/types";
import { APPROVAL_CATEGORY_LABEL } from "@/config/approvals";
import type { CompanyContext, Executor, Usage } from "./executor";
import {
  costTotals,
  isMemberActive,
  missionProgress,
  standbyMemberIds,
  taskCounts,
  workloadByMember,
} from "./metrics";

/**
 * CHAD CORE の実行エンジン。
 *
 * CEO指示 → CHAD分析 → Project生成 → Task分解 → 割当 → 実行 → レビュー → 報告
 * を「期限付きの状態機械」として進める。各工程は保存データの状態に基づいて進み、
 * AI処理（計画・作業・レビュー・報告）は「リース取得 → ロック外で実行 → リース確認して確定」
 * の手順で行うため、同じTaskが二重に実行されることはない。
 */

export type Timing = {
  analyzeMs: number;
  thinkMs: number;
  workMs: number;
  reviewMs: number;
  reportMs: number;
};

export type EngineDeps = {
  store: CompanyStore;
  executor: Executor;
  limits: Limits;
  timing: Timing;
  now: () => Date;
  /** 円換算のコスト計算（デモは推定値） */
  costOf: (usage: Usage) => number;
  workerId?: string;
};

export class EngineError extends Error {
  constructor(
    message: string,
    readonly code: "HALTED" | "LIMIT" | "NOT_FOUND" | "INVALID_STATE",
  ) {
    super(message);
  }
}

const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const iso = (d: Date) => d.toISOString();
const plus = (d: Date, ms: number) => new Date(d.getTime() + ms).toISOString();
const isDue = (at: string | null | undefined, now: Date) => at != null && new Date(at).getTime() <= now.getTime();
const leaseFree = (t: { leaseUntil?: string }, now: Date) => !t.leaseUntil || new Date(t.leaseUntil) <= now;

function log(data: CompanyData, mode: DataMode, now: Date, a: Omit<Activity, "id" | "mode" | "at">) {
  data.activities.push({ id: newId("act"), mode, at: iso(now), ...a });
}

function audit(data: CompanyData, now: Date, actor: string, action: string, detail: string) {
  data.audit.push({ id: newId("aud"), at: iso(now), actor, action, detail });
}

function recordUsage(
  data: CompanyData,
  deps: EngineDeps,
  now: Date,
  usage: Usage,
  r: { memberId: string; purpose: "plan" | "work" | "review" | "report" | "answer"; commandId?: string; taskId?: string },
) {
  data.usage.push({
    id: newId("use"),
    mode: deps.executor.mode,
    at: iso(now),
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costJpy: deps.costOf(usage),
    estimated: deps.executor.mode === "demo",
    ...r,
  });
}

function halt(data: CompanyData, mode: DataMode, now: Date, reason: string) {
  if (data.safety.halted) return;
  data.safety.halted = true;
  data.safety.reason = reason;
  data.safety.haltedAt = iso(now);
  log(data, mode, now, { actorId: "chad", type: "safety", message: `安全停止：${reason}` });
  audit(data, now, "system", "safety.halt", reason);
}

function budgetExceeded(data: CompanyData, deps: EngineDeps, now: Date): string | null {
  const c = costTotals(data, deps.executor.mode, now);
  if (c.today >= deps.limits.dailyBudgetJpy) return `1日のAI予算上限（¥${deps.limits.dailyBudgetJpy}）に達しました`;
  if (c.thisMonth >= deps.limits.monthlyBudgetJpy) return `月間のAI予算上限（¥${deps.limits.monthlyBudgetJpy}）に達しました`;
  return null;
}

// ---------------------------------------------------------------------------
// CHADが判断に使う会社の現状
// ---------------------------------------------------------------------------

export function buildContext(data: CompanyData, mode: DataMode, now: Date): CompanyContext {
  const counts = taskCounts(data, mode, now);
  const progress = missionProgress(data, mode);
  const cost = costTotals(data, mode, now);
  const pendingApprovals = data.approvals.filter((a) => a.mode === mode && a.status === "PENDING");
  const recentDone = data.tasks
    .filter((t) => t.mode === mode && t.status === "DONE")
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
    .slice(0, 3);
  const label = mode === "demo" ? "（デモデータ）" : "";

  const statusSummary = [
    `【CHAD 状況報告${label}】`,
    `・MISSION 001：${progress.label}（最初の1円：未達成）`,
    `・本番の売上：¥0 / 目標 ¥${MISSION_001.monthlyRevenueTargetJpy.toLocaleString("ja-JP")}`,
    `・Task：実行中 ${counts.active}件 / 着手待ち ${counts.queued}件 / 本日完了 ${counts.doneToday}件 / 累計完了 ${counts.doneTotal}件`,
    `・CEO承認待ち：${pendingApprovals.length}件${pendingApprovals.length ? `（${pendingApprovals.map((a) => a.title).join("、")}）` : ""}`,
    `・本日のAIコスト：¥${cost.today.toFixed(2)}${mode === "demo" ? "（推定）" : ""}`,
    ...(recentDone.length ? [`・最近の完了：${recentDone.map((t) => t.title).join("、")}`] : []),
    data.safety.halted ? `・⚠ 安全停止中：${data.safety.reason}` : "",
    "",
    counts.active + counts.queued === 0 && pendingApprovals.length === 0
      ? "今は手が空いています。「MISSION 001を進めて」と指示をいただければ、すぐ動きます。"
      : pendingApprovals.length
        ? "CEOの承認が進めば、次の工程にすぐ進めます。"
        : "現在の仕事は順調に進んでいます。完了したら報告します。",
  ]
    .filter((l) => l !== "")
    .join("\n");

  return {
    mode,
    statusSummary,
    activeTaskCount: counts.active,
    queuedTaskCount: counts.queued,
    pendingApprovalCount: pendingApprovals.length,
    missionProgressLabel: progress.label,
    standbyMemberIds: standbyMemberIds(data, mode),
    pendingStaffingMemberIds: data.approvals
      .filter((a) => a.mode === mode && a.status === "PENDING" && a.category === "new_agent" && a.memberId)
      .map((a) => a.memberId!),
    workloadByMember: workloadByMember(data, mode),
  };
}

// ---------------------------------------------------------------------------
// CEO指示の受付
// ---------------------------------------------------------------------------

export async function submitCommand(
  deps: EngineDeps,
  input: CommandInput,
): Promise<{ command: Command; duplicate: boolean }> {
  const mode = deps.executor.mode;
  return deps.store.transact((data) => {
    const now = deps.now();
    // 同じ送信の再送（二重クリック・通信の再試行）は1件として扱う
    const existing = data.commands.find((c) => c.clientRequestId === input.clientRequestId);
    if (existing) return { command: existing, duplicate: true };

    if (data.safety.halted) {
      throw new EngineError(`安全停止中のため新しい指示を受け付けられません（${data.safety.reason}）`, "HALTED");
    }
    const today = jstDayKey(now);
    const todays = data.commands.filter((c) => c.mode === mode && jstDayKey(new Date(c.createdAt)) === today);
    if (todays.length >= deps.limits.maxCommandsPerDay) {
      throw new EngineError(`本日の指示数の上限（${deps.limits.maxCommandsPerDay}件）に達しました`, "LIMIT");
    }
    const active = data.commands.filter(
      (c) => c.mode === mode && ["ANALYZING", "RUNNING", "REPORTING"].includes(c.status),
    );
    if (active.length >= deps.limits.maxActiveCommands) {
      throw new EngineError(
        `同時に進められる指示は${deps.limits.maxActiveCommands}件までです。今の仕事が終わってから指示してください`,
        "LIMIT",
      );
    }
    const budget = budgetExceeded(data, deps, now);
    if (budget) throw new EngineError(budget, "LIMIT");

    const command: Command = {
      id: newId("cmd"),
      mode,
      text: input.text,
      clientRequestId: input.clientRequestId,
      status: "ANALYZING",
      createdAt: iso(now),
      updatedAt: iso(now),
      nextRunAt: plus(now, deps.timing.analyzeMs),
    };
    data.commands.push(command);
    data.messages.push({
      id: newId("msg"),
      mode,
      role: "ceo",
      kind: "command",
      text: input.text,
      createdAt: iso(now),
      commandId: command.id,
    });
    log(data, mode, now, { actorId: "ceo", type: "command", message: `CEOが指示：「${input.text}」`, commandId: command.id });
    log(data, mode, now, { actorId: "chad", type: "analysis", message: "CHADがCEO指示を受信し、意図の分析を開始", commandId: command.id });
    audit(data, now, "ceo", "command.submit", input.text);
    return { command, duplicate: false };
  });
}

// ---------------------------------------------------------------------------
// 処理サイクル
// ---------------------------------------------------------------------------

type Job =
  | { kind: "plan"; commandId: string; text: string; ctx: CompanyContext }
  | { kind: "work"; taskId: string }
  | { kind: "review"; taskId: string }
  | { kind: "report"; commandId: string };

type Claim = { job: Job; owner: string } | { inline: true } | null;

function depsDone(data: CompanyData, task: Task): boolean {
  return task.dependsOn.every((key) => {
    const dep = data.tasks.find((t) => t.commandId === task.commandId && t.key === key);
    return dep?.status === "DONE";
  });
}

function setBlocked(data: CompanyData, task: Task, now: Date, reason: string | undefined) {
  if (task.blockedReason === reason) return;
  task.blockedReason = reason;
  if (reason) {
    log(data, task.mode, now, {
      actorId: "chad",
      type: "system",
      message: `「${task.title}」は待機中：${reason}`,
      taskId: task.id,
      projectId: task.projectId,
      commandId: task.commandId,
    });
  }
}

/** 前工程が失敗・中止したTaskは、実行しても意味がないので中止する */
function cascadeCancel(data: CompanyData, failed: Task, now: Date) {
  const queue = [failed];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const t of data.tasks) {
      if (t.commandId !== cur.commandId || !t.dependsOn.includes(cur.key)) continue;
      if (TERMINAL_TASK_STATUSES.includes(t.status)) continue;
      t.status = "CANCELLED";
      t.nextRunAt = null;
      t.error = `前工程「${cur.title}」が完了しなかったため中止`;
      t.updatedAt = iso(now);
      log(data, t.mode, now, { actorId: "chad", type: "system", message: `「${t.title}」を中止（前工程が未完了）`, taskId: t.id, commandId: t.commandId, projectId: t.projectId });
      queue.push(t);
    }
  }
}

function refreshProjectStatus(data: CompanyData, projectId: string, now: Date) {
  const project = data.projects.find((p) => p.id === projectId);
  if (!project || project.status !== "ACTIVE") return;
  const tasks = data.tasks.filter((t) => t.projectId === projectId);
  if (!tasks.every((t) => TERMINAL_TASK_STATUSES.includes(t.status))) return;
  project.status = tasks.some((t) => t.status === "DONE") ? "COMPLETED" : "FAILED";
  project.completedAt = iso(now);
  log(data, project.mode, now, {
    actorId: "chad",
    type: "report",
    message: `Project「${project.title}」が${project.status === "COMPLETED" ? "完了" : "終了（未達）"}`,
    projectId,
    commandId: project.commandId,
  });
}

/** 期限が来た仕事を1つ選び、即時の状態遷移なら適用、AI処理ならリースを取得して返す */
function claimNext(data: CompanyData, deps: EngineDeps, now: Date): Claim {
  const mode = deps.executor.mode;
  const owner = `${deps.workerId ?? "worker"}:${randomUUID().slice(0, 8)}`;
  const leaseUntil = plus(now, deps.limits.leaseMs);
  const touch = (t: { updatedAt: string }) => (t.updatedAt = iso(now));

  // 1) CHADの計画（ANALYZING）
  for (const c of data.commands) {
    if (c.mode !== mode || c.status !== "ANALYZING" || !isDue(c.nextRunAt, now)) continue;
    c.nextRunAt = plus(now, deps.limits.leaseMs); // リース代わり：タイムアウト後に再取得可能
    touch(c);
    return { job: { kind: "plan", commandId: c.id, text: c.text, ctx: buildContext(data, mode, now) }, owner };
  }

  // 2) Taskの状態遷移
  const tasks = data.tasks
    .filter((t) => t.mode === mode && !TERMINAL_TASK_STATUSES.includes(t.status))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.order - b.order);

  for (const t of tasks) {
    if (!leaseFree(t, now)) continue;
    if (t.status === "THINKING" && isDue(t.nextRunAt, now)) {
      t.status = "WORKING";
      t.nextRunAt = plus(now, deps.timing.workMs);
      touch(t);
      log(data, mode, now, { actorId: t.assigneeId, type: "work", message: `${getMember(t.assigneeId)?.name}が「${t.title}」の成果物を作成中`, taskId: t.id, projectId: t.projectId, commandId: t.commandId });
      return { inline: true };
    }
    if (t.status === "REVISION" && isDue(t.nextRunAt, now)) {
      t.status = "WORKING";
      t.nextRunAt = plus(now, deps.timing.workMs);
      touch(t);
      log(data, mode, now, { actorId: t.assigneeId, type: "revision", message: `${getMember(t.assigneeId)?.name}が「${t.title}」を修正中`, taskId: t.id, projectId: t.projectId, commandId: t.commandId });
      return { inline: true };
    }
    if ((t.status === "WORKING" || t.status === "IN_REVIEW") && isDue(t.nextRunAt, now)) {
      if (t.attempts >= t.maxAttempts) {
        failTask(data, t, now, "再試行の上限に達しました");
        return { inline: true };
      }
      t.leaseOwner = owner;
      t.leaseUntil = leaseUntil;
      t.attempts += 1;
      touch(t);
      return { job: { kind: t.status === "WORKING" ? "work" : "review", taskId: t.id }, owner };
    }
  }

  // 3) 着手待ちTaskの割当（同時実行数・予算・社員ごとの上限を守る）
  const busy = data.tasks.filter((t) => t.mode === mode && ACTIVE_TASK_STATUSES.includes(t.status));
  for (const t of tasks) {
    if (t.status !== "QUEUED") continue;
    if (!depsDone(data, t)) {
      setBlocked(data, t, now, undefined);
      continue;
    }
    if (!isMemberActive(data, mode, t.assigneeId)) {
      setBlocked(data, t, now, "担当者が待機中（有効化にはCEO承認が必要）");
      continue;
    }
    if (busy.length >= deps.limits.maxConcurrentTasks) {
      setBlocked(data, t, now, `会社全体の同時実行数の上限（${deps.limits.maxConcurrentTasks}件）`);
      continue;
    }
    const agentBusy = busy.filter((b) => b.assigneeId === t.assigneeId && b.status !== "IN_REVIEW").length;
    if (agentBusy >= deps.limits.maxConcurrentPerAgent) {
      setBlocked(data, t, now, `${getMember(t.assigneeId)?.name}が別のTaskを実行中`);
      continue;
    }
    const today = jstDayKey(now);
    const startedToday = data.tasks.filter(
      (x) => x.mode === mode && x.assigneeId === t.assigneeId && x.startedAt && jstDayKey(new Date(x.startedAt)) === today,
    ).length;
    const limit = getMember(t.assigneeId)?.dailyTaskLimit ?? 0;
    if (startedToday >= limit) {
      setBlocked(data, t, now, `${getMember(t.assigneeId)?.name}の1日のTask上限（${limit}件）`);
      continue;
    }
    const budget = budgetExceeded(data, deps, now);
    if (budget) {
      halt(data, mode, now, budget);
      return null;
    }
    t.blockedReason = undefined;
    t.status = "THINKING";
    t.startedAt = t.startedAt ?? iso(now);
    t.nextRunAt = plus(now, deps.timing.thinkMs);
    touch(t);
    log(data, mode, now, { actorId: t.assigneeId, type: "start", message: `${getMember(t.assigneeId)?.name}が「${t.title}」に着手（方針を検討中）`, taskId: t.id, projectId: t.projectId, commandId: t.commandId });
    return { inline: true };
  }

  // 4) 指示単位の進行（全Taskが終わったらCHADが集約・報告）
  for (const c of data.commands) {
    if (c.mode !== mode) continue;
    if (c.status === "RUNNING") {
      const ts = data.tasks.filter((t) => t.commandId === c.id);
      const settled = ts.every((t) => TERMINAL_TASK_STATUSES.includes(t.status) || t.status === "WAITING_APPROVAL");
      if (settled) {
        c.status = "REPORTING";
        c.nextRunAt = plus(now, deps.timing.reportMs);
        touch(c);
        log(data, mode, now, { actorId: "chad", type: "report", message: "CHADが各部署の成果を集約中", commandId: c.id, projectId: c.projectId });
        return { inline: true };
      }
    }
    if (c.status === "REPORTING" && isDue(c.nextRunAt, now)) {
      c.nextRunAt = plus(now, deps.limits.leaseMs);
      touch(c);
      return { job: { kind: "report", commandId: c.id }, owner };
    }
  }
  return null;
}

function failTask(data: CompanyData, t: Task, now: Date, reason: string) {
  t.status = "FAILED";
  t.error = reason;
  t.nextRunAt = null;
  t.leaseOwner = undefined;
  t.leaseUntil = undefined;
  t.updatedAt = iso(now);
  log(data, t.mode, now, { actorId: t.assigneeId, type: "error", message: `「${t.title}」が失敗：${reason}`, taskId: t.id, projectId: t.projectId, commandId: t.commandId });
  cascadeCancel(data, t, now);
  refreshProjectStatus(data, t.projectId, now);
}

function createApproval(data: CompanyData, now: Date, a: Omit<Approval, "id" | "status" | "createdAt">): Approval {
  const approval: Approval = { id: newId("apv"), status: "PENDING", createdAt: iso(now), ...a };
  data.approvals.push(approval);
  log(data, a.mode, now, { actorId: "chad", type: "approval", message: `CEO承認を依頼：${approval.title}`, taskId: a.taskId, commandId: a.commandId });
  return approval;
}

// ---- AI処理の確定 ----

async function runJob(deps: EngineDeps, job: Job, owner: string): Promise<void> {
  const mode = deps.executor.mode;
  const store = deps.store;

  if (job.kind === "plan") {
    try {
      const { plan, usage } = await deps.executor.plan(job.text, job.ctx);
      await store.transact((data) => {
        const now = deps.now();
        const c = data.commands.find((x) => x.id === job.commandId);
        if (!c || c.status !== "ANALYZING") return; // すでに他のワーカーが処理済み
        recordUsage(data, deps, now, usage, { memberId: "chad", purpose: plan.project ? "plan" : "answer", commandId: c.id });
        c.analysis = plan.analysis;
        c.updatedAt = iso(now);
        c.nextRunAt = null;
        log(data, mode, now, { actorId: "chad", type: "analysis", message: `CHADが意図を判断：${plan.analysis.intentLabel}（優先度：${plan.analysis.priority}）`, commandId: c.id });
        log(data, mode, now, { actorId: "chad", type: "analysis", message: `CHADがMISSION 001・KPIを確認：${plan.analysis.missionCheck}`, commandId: c.id });

        if (!plan.project || plan.tasks.length === 0) {
          c.status = "ANSWERED";
          c.completedAt = iso(now);
          data.messages.push({ id: newId("msg"), mode, role: "chad", kind: "answer", text: plan.reply, createdAt: iso(now), commandId: c.id });
          log(data, mode, now, { actorId: "chad", type: "report", message: "CHADがCEOへ回答", commandId: c.id });
          if (plan.staffingProposal) {
            const p = plan.staffingProposal;
            const m = getMember(p.memberId);
            createApproval(data, now, {
              mode,
              category: "new_agent",
              title: `AI社員「${m?.name}」の有効化`,
              action: `${m?.name}（${m?.title}）を待機から稼働に切り替える`,
              purpose: p.reason,
              expectedEffect: p.expectedEffect,
              costJpy: p.monthlyCostJpy,
              risk: "AI利用料が増える。業務量が減った場合は待機に戻す判断が必要。",
              chadRecommendation: "業務量の裏付けがあるため推奨します。費用は月間予算内に収まります。",
              requestedBy: "chad",
              commandId: c.id,
              memberId: p.memberId,
            });
          }
          return;
        }

        const tasks = plan.tasks.slice(0, deps.limits.maxTasksPerCommand);
        const project = {
          id: newId("prj"),
          mode,
          commandId: c.id,
          missionId: MISSION_001.id,
          title: plan.project.title,
          objective: plan.project.objective,
          priority: plan.analysis.priority,
          executiveId: plan.project.executiveId,
          status: "ACTIVE" as const,
          createdAt: iso(now),
        };
        data.projects.push(project);
        c.projectId = project.id;
        c.status = "RUNNING";
        data.messages.push({ id: newId("msg"), mode, role: "chad", kind: "analysis", text: plan.reply, createdAt: iso(now), commandId: c.id });
        log(data, mode, now, { actorId: "chad", type: "plan", message: `CHADがProject「${project.title}」を作成`, commandId: c.id, projectId: project.id });
        log(data, mode, now, { actorId: "chad", type: "plan", message: `CHADがTaskを${tasks.length}件に分解`, commandId: c.id, projectId: project.id });

        tasks.forEach((pt, i) => {
          const task: Task = {
            id: newId("tsk"),
            mode,
            projectId: project.id,
            commandId: c.id,
            key: pt.key,
            intent: plan.analysis.intent,
            order: i,
            title: pt.title,
            description: pt.description,
            department: pt.department,
            assigneeId: pt.assigneeId,
            reviewerId: REVIEWER_BY_DEPARTMENT[pt.department],
            executiveId: EXECUTIVE_BY_DEPARTMENT[pt.department],
            dependsOn: pt.dependsOn,
            status: "QUEUED",
            milestone: pt.milestone,
            requiresApproval: pt.requiresApproval,
            demoRevision: pt.demoRevision,
            attempts: 0,
            maxAttempts: deps.limits.maxAttempts,
            revisionCount: 0,
            reviews: [],
            createdAt: iso(now),
            updatedAt: iso(now),
            nextRunAt: null,
          };
          data.tasks.push(task);
          const exec = getMember(task.executiveId);
          log(data, mode, now, {
            actorId: "chad",
            type: "assign",
            message: `${exec?.name}（${exec?.title}）の部門へ「${task.title}」を発行 → 担当：${getMember(task.assigneeId)?.name}`,
            commandId: c.id,
            projectId: project.id,
            taskId: task.id,
          });
        });
      });
    } catch (e) {
      await store.transact((data) => {
        const now = deps.now();
        const c = data.commands.find((x) => x.id === job.commandId);
        if (!c || c.status !== "ANALYZING") return;
        c.status = "FAILED";
        c.error = (e as Error).message;
        c.nextRunAt = null;
        c.updatedAt = iso(now);
        data.messages.push({ id: newId("msg"), mode, role: "chad", kind: "warning", text: `申し訳ありません、計画の作成に失敗しました：${c.error}`, createdAt: iso(now), commandId: c.id });
        log(data, mode, now, { actorId: "chad", type: "error", message: `CHADの計画作成に失敗：${c.error}`, commandId: c.id });
        noteFailure(data, deps, now);
      });
    }
    return;
  }

  if (job.kind === "report") {
    const snapshot = await store.read();
    const command = snapshot.commands.find((c) => c.id === job.commandId);
    const project = snapshot.projects.find((p) => p.id === command?.projectId);
    if (!command || !project) return;
    try {
      const { text, usage } = await deps.executor.report({
        command,
        project,
        tasks: snapshot.tasks.filter((t) => t.commandId === command.id),
        approvals: snapshot.approvals.filter((a) => a.commandId === command.id),
      });
      await store.transact((data) => {
        const now = deps.now();
        const c = data.commands.find((x) => x.id === job.commandId);
        if (!c || c.status !== "REPORTING") return;
        recordUsage(data, deps, now, usage, { memberId: "chad", purpose: "report", commandId: c.id });
        c.status = "COMPLETED";
        c.completedAt = iso(now);
        c.updatedAt = iso(now);
        c.nextRunAt = null;
        data.messages.push({ id: newId("msg"), mode, role: "chad", kind: "report", text, createdAt: iso(now), commandId: c.id });
        log(data, mode, now, { actorId: "chad", type: "report", message: "CHADがCEOへ結果を報告", commandId: c.id, projectId: c.projectId });
        data.safety.consecutiveFailures = 0;
      });
    } catch (e) {
      await store.transact((data) => {
        const now = deps.now();
        const c = data.commands.find((x) => x.id === job.commandId);
        if (!c || c.status !== "REPORTING") return;
        c.nextRunAt = plus(now, 5000);
        log(data, mode, now, { actorId: "chad", type: "error", message: `報告の作成に失敗（再試行します）：${(e as Error).message}`, commandId: c.id });
        noteFailure(data, deps, now);
      });
    }
    return;
  }

  // work / review
  const snapshot = await store.read();
  const task = snapshot.tasks.find((t) => t.id === job.taskId);
  const project = snapshot.projects.find((p) => p.id === task?.projectId);
  if (!task || !project || task.leaseOwner !== owner) return;

  try {
    if (job.kind === "work") {
      const upstream = snapshot.tasks
        .filter((t) => t.commandId === task.commandId && task.dependsOn.includes(t.key) && t.deliverable)
        .map((t) => ({ title: t.title, deliverable: t.deliverable! }));
      const { text, usage } = await deps.executor.work({ task, project, upstream, previousReviews: task.reviews });
      await store.transact((data) => {
        const now = deps.now();
        const t = data.tasks.find((x) => x.id === job.taskId);
        if (!t || t.leaseOwner !== owner || t.status !== "WORKING") return; // リースを失った＝他で処理済み
        recordUsage(data, deps, now, usage, { memberId: t.assigneeId, purpose: "work", commandId: t.commandId, taskId: t.id });
        t.deliverable = text;
        t.status = "IN_REVIEW";
        t.attempts = 0;
        t.leaseOwner = undefined;
        t.leaseUntil = undefined;
        t.nextRunAt = plus(now, deps.timing.reviewMs);
        t.updatedAt = iso(now);
        data.safety.consecutiveFailures = 0;
        log(data, mode, now, { actorId: t.assigneeId, type: "deliver", message: `${getMember(t.assigneeId)?.name}が「${t.title}」の成果物を提出`, taskId: t.id, projectId: t.projectId, commandId: t.commandId });
        log(data, mode, now, { actorId: t.reviewerId, type: "review", message: `${getMember(t.reviewerId)?.name}がレビューを開始`, taskId: t.id, projectId: t.projectId, commandId: t.commandId });
      });
    } else {
      const { verdict, comment, usage } = await deps.executor.review(task);
      await store.transact((data) => {
        const now = deps.now();
        const t = data.tasks.find((x) => x.id === job.taskId);
        if (!t || t.leaseOwner !== owner || t.status !== "IN_REVIEW") return;
        recordUsage(data, deps, now, usage, { memberId: t.reviewerId, purpose: "review", commandId: t.commandId, taskId: t.id });
        t.reviews.push({ reviewerId: t.reviewerId, verdict, comment, at: iso(now) });
        t.attempts = 0;
        t.leaseOwner = undefined;
        t.leaseUntil = undefined;
        t.updatedAt = iso(now);
        data.safety.consecutiveFailures = 0;
        const reviewer = getMember(t.reviewerId)?.name;

        if (verdict === "REVISION") {
          if (t.revisionCount >= deps.limits.maxRevisions) {
            failTask(data, t, now, `修正の上限（${deps.limits.maxRevisions}回）に達しました。CHADが内容を見直します`);
            return;
          }
          t.revisionCount += 1;
          t.status = "REVISION";
          t.nextRunAt = plus(now, deps.timing.thinkMs);
          log(data, mode, now, { actorId: t.reviewerId, type: "revision", message: `${reviewer}が修正を依頼：${comment}`, taskId: t.id, projectId: t.projectId, commandId: t.commandId });
          return;
        }

        log(data, mode, now, { actorId: t.reviewerId, type: "review", message: `${reviewer}が「${t.title}」を承認：${comment}`, taskId: t.id, projectId: t.projectId, commandId: t.commandId });
        if (t.requiresApproval) {
          t.status = "WAITING_APPROVAL";
          t.nextRunAt = null;
          const approval = createApproval(data, now, {
            mode,
            category: t.requiresApproval,
            title: `${APPROVAL_CATEGORY_LABEL[t.requiresApproval]}：${t.title.replace(/（CEO承認後に実行）$/, "")}`,
            action: t.deliverable ?? t.description,
            purpose: t.description,
            expectedEffect: "MISSION 001の次の工程（顧客との接点づくり）に進める。",
            costJpy: 0,
            risk: "外部の相手に届くため、送信後は取り消せない。表現や宛先の誤りは信用を損なう。",
            chadRecommendation: `${reviewer}のレビュー済み。内容・宛先に問題がなければ承認を推奨します。`,
            requestedBy: t.assigneeId,
            taskId: t.id,
            commandId: t.commandId,
          });
          t.approvalId = approval.id;
          return;
        }
        t.status = "DONE";
        t.completedAt = iso(now);
        t.nextRunAt = null;
        log(data, mode, now, { actorId: "chad", type: "report", message: `CHADへ報告：「${t.title}」が完了`, taskId: t.id, projectId: t.projectId, commandId: t.commandId });
        refreshProjectStatus(data, t.projectId, now);
      });
    }
  } catch (e) {
    await store.transact((data) => {
      const now = deps.now();
      const t = data.tasks.find((x) => x.id === job.taskId);
      if (!t || t.leaseOwner !== owner) return;
      t.leaseOwner = undefined;
      t.leaseUntil = undefined;
      t.error = (e as Error).message;
      t.updatedAt = iso(now);
      noteFailure(data, deps, now);
      if (t.attempts >= t.maxAttempts) {
        failTask(data, t, now, `再試行の上限に達しました（${t.error}）`);
      } else {
        // 指数バックオフで再試行
        t.nextRunAt = plus(now, 2000 * 2 ** (t.attempts - 1));
        log(data, mode, now, { actorId: t.assigneeId, type: "error", message: `「${t.title}」でエラー（${t.attempts}/${t.maxAttempts}回目、再試行します）：${t.error}`, taskId: t.id, projectId: t.projectId, commandId: t.commandId });
      }
    });
  }
}

function noteFailure(data: CompanyData, deps: EngineDeps, now: Date) {
  data.safety.consecutiveFailures += 1;
  if (data.safety.consecutiveFailures >= deps.limits.haltAfterConsecutiveFailures) {
    halt(data, deps.executor.mode, now, `エラーが${data.safety.consecutiveFailures}回連続したため`);
  }
}

const globalTick = globalThis as unknown as { __aitTicking?: Promise<number> };

/**
 * 期限が来た仕事を処理する。1回の呼び出しで行う遷移数には上限がある（無限ループ防止）。
 * 同じプロセスで同時に呼ばれた場合は進行中の処理を共有する。
 */
export function tick(deps: EngineDeps): Promise<number> {
  if (globalTick.__aitTicking) return globalTick.__aitTicking;
  const run = (async () => {
    let transitions = 0;
    while (transitions < deps.limits.maxTransitionsPerTick) {
      const claim = await deps.store.transact((data) => {
        if (data.safety.halted) return null;
        return claimNext(data, deps, deps.now());
      });
      if (!claim) break;
      transitions++;
      if ("inline" in claim) continue;
      await runJob(deps, claim.job, claim.owner);
    }
    return transitions;
  })();
  globalTick.__aitTicking = run;
  return run.finally(() => {
    globalTick.__aitTicking = undefined;
  });
}

// ---------------------------------------------------------------------------
// CEOの承認
// ---------------------------------------------------------------------------

export async function decideApproval(
  deps: EngineDeps,
  approvalId: string,
  decision: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED",
  comment?: string,
): Promise<Approval> {
  const mode = deps.executor.mode;
  return deps.store.transact((data) => {
    const now = deps.now();
    const a = data.approvals.find((x) => x.id === approvalId);
    if (!a) throw new EngineError("承認依頼が見つかりません", "NOT_FOUND");
    if (a.status !== "PENDING") throw new EngineError("この承認依頼はすでに判断済みです", "INVALID_STATE");
    a.status = decision;
    a.decidedAt = iso(now);
    a.ceoComment = comment;
    const label = { APPROVED: "承認", REJECTED: "却下", CHANGES_REQUESTED: "修正依頼" }[decision];
    audit(data, now, "ceo", `approval.${decision.toLowerCase()}`, `${a.title}${comment ? `（${comment}）` : ""}`);
    log(data, a.mode, now, { actorId: "ceo", type: "approval", message: `CEOが${label}：${a.title}${comment ? `（${comment}）` : ""}`, taskId: a.taskId, commandId: a.commandId });

    if (a.category === "new_agent" && a.memberId) {
      if (decision === "APPROVED" && !data.staffing[a.mode].includes(a.memberId)) {
        data.staffing[a.mode].push(a.memberId);
        log(data, a.mode, now, { actorId: "chad", type: "system", message: `${getMember(a.memberId)?.name}を有効化しました` });
      }
      return a;
    }

    const t = a.taskId ? data.tasks.find((x) => x.id === a.taskId) : undefined;
    if (!t || t.status !== "WAITING_APPROVAL") return a;
    t.updatedAt = iso(now);
    if (decision === "APPROVED") {
      t.status = "DONE";
      t.completedAt = iso(now);
      const note = mode === "demo" ? "（DEMO MODEのため外部への送信・公開は行っていません）" : "";
      log(data, t.mode, now, { actorId: t.assigneeId, type: "deliver", message: `${getMember(t.assigneeId)?.name}が承認済みの「${t.title}」を実行${note}`, taskId: t.id, projectId: t.projectId, commandId: t.commandId });
      data.messages.push({ id: newId("msg"), mode: t.mode, role: "chad", kind: "report", text: `承認ありがとうございます。「${t.title}」を実行しました。${note}`, createdAt: iso(now), commandId: t.commandId });
      refreshProjectStatus(data, t.projectId, now);
    } else if (decision === "REJECTED") {
      t.status = "CANCELLED";
      t.error = `CEOが却下${comment ? `：${comment}` : ""}`;
      cascadeCancel(data, t, now);
      refreshProjectStatus(data, t.projectId, now);
    } else {
      t.status = "REVISION";
      t.reviews.push({ reviewerId: "ceo", verdict: "REVISION", comment: comment || "CEOから修正依頼", at: iso(now) });
      t.revisionCount += 1;
      t.nextRunAt = plus(now, deps.timing.thinkMs);
      t.approvalId = undefined;
      // 報告済みの指示でも、再作業の完了後に改めて承認依頼と報告を行う
      const c = data.commands.find((x) => x.id === t.commandId);
      if (c && c.status === "COMPLETED") {
        c.status = "RUNNING";
        c.updatedAt = iso(now);
      }
    }
    return a;
  });
}

// ---------------------------------------------------------------------------
// 安全停止の解除・デモのリセット
// ---------------------------------------------------------------------------

export async function resumeOperations(deps: EngineDeps): Promise<void> {
  await deps.store.transact((data) => {
    const now = deps.now();
    if (!data.safety.halted) return;
    const budget = budgetExceeded(data, deps, now);
    if (budget) throw new EngineError(`${budget}。予算を変更するまで再開できません`, "LIMIT");
    audit(data, now, "ceo", "safety.resume", data.safety.reason ?? "");
    data.safety = { halted: false, consecutiveFailures: 0 };
    log(data, deps.executor.mode, now, { actorId: "ceo", type: "safety", message: "CEOが安全停止を解除し、稼働を再開" });
  });
}

/** デモデータのみ削除する（本番データ・監査ログは残す） */
export async function resetDemoData(deps: EngineDeps): Promise<void> {
  await deps.store.transact((data) => {
    const now = deps.now();
    const keep = <T extends { mode: DataMode }>(xs: T[]) => xs.filter((x) => x.mode !== "demo");
    data.commands = keep(data.commands);
    data.messages = keep(data.messages);
    data.projects = keep(data.projects);
    data.tasks = keep(data.tasks);
    data.activities = keep(data.activities);
    data.approvals = keep(data.approvals);
    data.usage = keep(data.usage);
    data.staffing.demo = [];
    data.safety = { halted: false, consecutiveFailures: 0 };
    audit(data, now, "ceo", "demo.reset", "デモデータを初期化");
  });
}
