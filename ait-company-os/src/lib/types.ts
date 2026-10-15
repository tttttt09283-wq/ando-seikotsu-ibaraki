import { z } from "zod";
import type { DepartmentId, MilestoneId } from "@/config/company";

/** demo = デモデータ / live = 本番データ。すべての記録に必ず付与し、混同を防ぐ。 */
export type DataMode = "demo" | "live";

export const AGENT_STATUSES = [
  "IDLE",
  "THINKING",
  "WORKING",
  "REVIEWING",
  "WAITING_APPROVAL",
  "STANDBY",
  "ERROR",
] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export type TaskStatus =
  | "QUEUED" // 割当済み・着手待ち
  | "THINKING" // AI社員が方針検討中
  | "WORKING" // 成果物を作成中
  | "IN_REVIEW" // マネージャーがレビュー中
  | "REVISION" // 修正依頼を受けて再作業待ち
  | "WAITING_APPROVAL" // CEO承認待ち（外部行動を伴う）
  | "DONE"
  | "FAILED"
  | "CANCELLED";

export const ACTIVE_TASK_STATUSES: TaskStatus[] = ["THINKING", "WORKING", "IN_REVIEW", "REVISION"];
export const TERMINAL_TASK_STATUSES: TaskStatus[] = ["DONE", "FAILED", "CANCELLED"];

export type CommandStatus =
  | "ANALYZING" // CHADが意図分析・計画中
  | "RUNNING" // Taskを実行中
  | "REPORTING" // CHADが成果を集約中
  | "COMPLETED"
  | "ANSWERED" // Projectを作らずCHADが直接回答
  | "FAILED"
  | "BLOCKED"; // 安全制限で停止

export type Intent =
  | "mission"
  | "product"
  | "sales"
  | "sns"
  | "automation"
  | "finance"
  | "staffing"
  | "status_report"
  | "general";

export type Priority = "高" | "中" | "低";

export type ChadAnalysis = {
  intent: Intent;
  intentLabel: string;
  understanding: string;
  missionCheck: string;
  priority: Priority;
  priorityReason: string;
  /** CHADの反対意見・懸念（必要な場合のみ） */
  concern?: string;
};

export type Command = {
  id: string;
  mode: DataMode;
  text: string;
  clientRequestId: string;
  status: CommandStatus;
  createdAt: string;
  updatedAt: string;
  nextRunAt: string | null;
  analysis?: ChadAnalysis;
  projectId?: string;
  error?: string;
  completedAt?: string;
};

export type ChatMessage = {
  id: string;
  mode: DataMode;
  role: "ceo" | "chad";
  kind: "command" | "analysis" | "report" | "answer" | "warning";
  text: string;
  createdAt: string;
  commandId?: string;
};

export type Project = {
  id: string;
  mode: DataMode;
  commandId: string;
  missionId: string;
  title: string;
  objective: string;
  priority: Priority;
  executiveId: string;
  status: "ACTIVE" | "COMPLETED" | "FAILED";
  createdAt: string;
  completedAt?: string;
};

export type ApprovalCategory =
  | "sns_post"
  | "external_message"
  | "customer_proposal"
  | "contract"
  | "payment"
  | "budget_change"
  | "new_agent"
  | "data_deletion"
  | "external_write";

export type Review = {
  reviewerId: string;
  verdict: "APPROVED" | "REVISION";
  comment: string;
  at: string;
};

export type Task = {
  id: string;
  mode: DataMode;
  projectId: string;
  commandId: string;
  /** 計画内のキー（依存関係・テンプレート参照に使う） */
  key: string;
  intent: Intent;
  order: number;
  title: string;
  description: string;
  department: Exclude<DepartmentId, "executive">;
  assigneeId: string;
  reviewerId: string;
  executiveId: string;
  dependsOn: string[];
  status: TaskStatus;
  milestone?: MilestoneId;
  /** 外部行動を伴う場合、レビュー後にCEO承認が必要 */
  requiresApproval?: ApprovalCategory;
  approvalId?: string;
  /** デモ用：最初のレビューで修正依頼を出すか */
  demoRevision?: boolean;
  attempts: number;
  maxAttempts: number;
  revisionCount: number;
  deliverable?: string;
  reviews: Review[];
  error?: string;
  /** 着手できない理由（制限・依存待ちなど）。変化したときだけログに残す */
  blockedReason?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  nextRunAt: string | null;
  /** 二重実行防止用のリース */
  leaseOwner?: string;
  leaseUntil?: string;
};

export type Activity = {
  id: string;
  mode: DataMode;
  at: string;
  actorId: string;
  type:
    | "command"
    | "analysis"
    | "plan"
    | "assign"
    | "start"
    | "work"
    | "deliver"
    | "review"
    | "revision"
    | "approval"
    | "report"
    | "safety"
    | "error"
    | "system";
  message: string;
  commandId?: string;
  projectId?: string;
  taskId?: string;
};

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";

export type Approval = {
  id: string;
  mode: DataMode;
  category: ApprovalCategory;
  title: string;
  action: string;
  purpose: string;
  expectedEffect: string;
  costJpy: number;
  risk: string;
  chadRecommendation: string;
  status: ApprovalStatus;
  requestedBy: string;
  createdAt: string;
  decidedAt?: string;
  ceoComment?: string;
  taskId?: string;
  commandId?: string;
  /** new_agent の場合の対象社員 */
  memberId?: string;
};

export type UsageRecord = {
  id: string;
  mode: DataMode;
  at: string;
  memberId: string;
  commandId?: string;
  taskId?: string;
  purpose: "plan" | "work" | "review" | "report" | "answer";
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** デモでは推定値 */
  costJpy: number;
  estimated: boolean;
};

export type AuditEntry = {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
};

export type SafetyState = {
  halted: boolean;
  reason?: string;
  haltedAt?: string;
  consecutiveFailures: number;
};

/** 有効化（CEO承認済み）した社員のID。デモと本番で分けて保持する */
export type StaffingState = Record<DataMode, string[]>;

export type CompanyData = {
  schemaVersion: 1;
  commands: Command[];
  messages: ChatMessage[];
  projects: Project[];
  tasks: Task[];
  activities: Activity[];
  approvals: Approval[];
  usage: UsageRecord[];
  audit: AuditEntry[];
  safety: SafetyState;
  staffing: StaffingState;
};

export function emptyCompanyData(): CompanyData {
  return {
    schemaVersion: 1,
    commands: [],
    messages: [],
    projects: [],
    tasks: [],
    activities: [],
    approvals: [],
    usage: [],
    audit: [],
    safety: { halted: false, consecutiveFailures: 0 },
    staffing: { demo: [], live: [] },
  };
}

// ---- 入力検証（API境界） ----

export const commandInputSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "指示を入力してください")
    .max(500, "指示は500文字以内で入力してください"),
  clientRequestId: z.string().uuid(),
});
export type CommandInput = z.infer<typeof commandInputSchema>;

export const approvalDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED"]),
  comment: z.string().trim().max(500).optional(),
});

export const loginSchema = z.object({
  passcode: z.string().max(200).optional(),
  demo: z.boolean().optional(),
});
