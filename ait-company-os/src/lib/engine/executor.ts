import type { DepartmentId, MilestoneId } from "@/config/company";
import type {
  Approval,
  ApprovalCategory,
  ChadAnalysis,
  Command,
  DataMode,
  Project,
  Review,
  Task,
} from "@/lib/types";

/**
 * CHAD・AI社員の「頭脳」部分のインターフェース。
 * DEMO MODE ではテンプレートで、PHASE 3 では Claude API で実装する。
 * 状態遷移・制限・ログはエンジン側が担い、Executor は中身の生成だけを行う。
 */

export type Usage = { model: string; inputTokens: number; outputTokens: number };

export type PlannedTask = {
  key: string;
  title: string;
  description: string;
  department: Exclude<DepartmentId, "executive">;
  assigneeId: string;
  dependsOn: string[];
  milestone?: MilestoneId;
  requiresApproval?: ApprovalCategory;
  demoRevision?: boolean;
};

export type StaffingProposal = {
  memberId: string;
  reason: string;
  expectedEffect: string;
  monthlyCostJpy: number;
};

export type Plan = {
  analysis: ChadAnalysis;
  /** CEOへの返答（計画の説明、または直接回答） */
  reply: string;
  project?: { title: string; objective: string; executiveId: string };
  tasks: PlannedTask[];
  staffingProposal?: StaffingProposal;
};

/** CHADが判断に使う会社の現状（実データから算出） */
export type CompanyContext = {
  mode: DataMode;
  statusSummary: string;
  activeTaskCount: number;
  queuedTaskCount: number;
  pendingApprovalCount: number;
  missionProgressLabel: string;
  standbyMemberIds: string[];
  pendingStaffingMemberIds: string[];
  /** 社員ごとの未完了Task数（増員判断に使う） */
  workloadByMember: Record<string, number>;
};

export type WorkInput = {
  task: Task;
  project: Project;
  /** 依存Taskの成果物（前工程の結果を引き継ぐ） */
  upstream: { title: string; deliverable: string }[];
  previousReviews: Review[];
};

export type ReportInput = {
  command: Command;
  project: Project;
  tasks: Task[];
  approvals: Approval[];
};

export interface Executor {
  readonly mode: DataMode;
  plan(text: string, ctx: CompanyContext): Promise<{ plan: Plan; usage: Usage }>;
  work(input: WorkInput): Promise<{ text: string; usage: Usage }>;
  review(task: Task): Promise<{ verdict: Review["verdict"]; comment: string; usage: Usage }>;
  report(input: ReportInput): Promise<{ text: string; usage: Usage }>;
}
