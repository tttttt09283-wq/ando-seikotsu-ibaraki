import { z } from "zod";

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
  | "IN_REVIEW" // リーダーがレビュー中
  | "REVISION" // 修正依頼を受けて再作業待ち
  | "WAITING_APPROVAL" // 人間の承認待ち（外部行動・確定事項を伴う）
  | "DONE"
  | "FAILED"
  | "CANCELLED";

export const ACTIVE_TASK_STATUSES: TaskStatus[] = ["THINKING", "WORKING", "IN_REVIEW", "REVISION"];
export const TERMINAL_TASK_STATUSES: TaskStatus[] = ["DONE", "FAILED", "CANCELLED"];

export type CommandStatus =
  | "ANALYZING" // 司令塔が意図分析・計画中
  | "RUNNING" // Taskを実行中
  | "REPORTING" // 司令塔が成果を集約中
  | "COMPLETED"
  | "ANSWERED" // Projectを作らず司令塔が直接回答
  | "FAILED"
  | "BLOCKED"; // 安全制限で停止

/** 指示の種類。会社ごとの判断ルール（tenants/）で定義する。status_report / staffing / general は共通 */
export type Intent = string;

export type Priority = "高" | "中" | "低";

export type CommanderAnalysis = {
  intent: Intent;
  intentLabel: string;
  understanding: string;
  missionCheck: string;
  priority: Priority;
  priorityReason: string;
  /** 司令塔の反対意見・懸念（必要な場合のみ） */
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
  analysis?: CommanderAnalysis;
  projectId?: string;
  error?: string;
  completedAt?: string;
};

export type ChatMessage = {
  id: string;
  mode: DataMode;
  /** operator = 指示者（統括責任者） / commander = 司令塔 */
  role: "operator" | "commander";
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
  /** 担当リーダー */
  leadId: string;
  /** 取り組む課題（Issue.id） */
  issueIds: string[];
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
  | "external_write"
  | "staff_evaluation";

export type Review = {
  reviewerId: string;
  verdict: "APPROVED" | "REVISION";
  comment: string;
  at: string;
};

export type ApprovalMeta = {
  costJpy?: number;
  corporate?: boolean;
  sensitive?: boolean;
  expectedEffect?: string;
  risk?: string;
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
  teamId: string;
  assigneeId: string;
  /** レビュー担当リーダー */
  reviewerId: string;
  dependsOn: string[];
  status: TaskStatus;
  milestone?: string;
  /** 外部行動・確定事項を伴う場合、レビュー後に人間の承認が必要 */
  requiresApproval?: ApprovalCategory;
  approvalMeta?: ApprovalMeta;
  approvalId?: string;
  businessUnits?: string[];
  /** スタッフ評価など閲覧者を限定すべき内容 */
  confidential?: boolean;
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

export type ApproverRole = "operator" | "president";

export type ApprovalEvent = {
  at: string;
  /** 操作した人（member id） */
  actor: string;
  action: "REQUESTED" | "ESCALATED" | "RETURNED" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
  comment?: string;
};

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
  /** 司令塔の推奨理由（内容について） */
  commanderRecommendation: string;
  /** 司令塔が推奨する承認者とその理由 */
  recommendedApprover: ApproverRole;
  approverReason: string;
  /** true = 代表の決裁が必須（統括責任者は承認できない） */
  presidentRequired: boolean;
  /** いま判断する人 */
  currentApprover: ApproverRole;
  status: ApprovalStatus;
  requestedBy: string;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionComment?: string;
  /** 誰がいつ何をしたか（すべて記録） */
  history: ApprovalEvent[];
  taskId?: string;
  commandId?: string;
  /** new_agent の場合の対象社員 */
  memberId?: string;
  /** 承認後に実行する外部への書き込み（口コミへの返信など） */
  payload?: ApprovalPayload;
  /** 承認後の実行結果 */
  execution?: { status: "done" | "failed" | "skipped"; at: string; message: string };
};

export type ApprovalPayload = { kind: "review_reply"; reviewId: string; comment: string };

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

/** 有効化（承認済み）した社員のID。デモと本番で分けて保持する */
export type StaffingState = Record<DataMode, string[]>;

/** 数字の出どころ */
export type NumberSource = "sheet" | "csv" | "manual";

/**
 * 院（または全院合計 clinicId = "all"）の月ごとの指標。人が管理する本番の数字。
 * AIの成果物（デモ）とは別に保存し、デモの数字は混ぜない。
 */
export type ClinicMonthRecord = {
  id: string;
  /** 対象月 YYYY-MM */
  month: string;
  clinicId: string;
  /** 指標 key → 値（円・件・%） */
  values: Record<string, number>;
  source: NumberSource;
  /** 取り込み元の説明（ファイル名・シート名など） */
  sourceLabel?: string;
  updatedBy: string;
  updatedAt: string;
};

/** 事業計画書の1行×1か月（院別の売上計画 または 損益の行） */
export type PlanRecord = {
  month: string;
  /** 事業計画書の行名（正規化前） */
  label: string;
  /** 院の売上計画の行なら院の id */
  clinicId?: string;
  amountJpy: number;
};

/** 月ごとの日計表（Googleスプレッドシート） */
export type SheetSource = {
  month: string;
  spreadsheetId: string;
  sheetName: string;
  /** 公開リンクで読むときのタブ番号（URL の gid） */
  gid?: string;
  lastSyncAt?: string;
  lastStatus?: "ok" | "error";
  lastMessage?: string;
};

export type DataSourceState = {
  sheets: SheetSource[];
  planImportedAt?: string;
  planLabel?: string;
};

// ---- 口コミ・Googleビジネスプロフィール・地域の競合 ----

/** Googleビジネスプロフィールのロケーション（院のプロフィール） */
export type GbpLocation = {
  /** locations/123… */
  name: string;
  /** accounts/123… */
  accountName: string;
  title: string;
  address?: string;
  placeId?: string;
  mapsUri?: string;
  /** 対応する院（未設定なら集計に含めない） */
  clinicId?: string;
  averageRating?: number;
  totalReviewCount?: number;
  mode: DataMode;
};

/**
 * 自院の口コミ。投稿者名・本文はお客様の個人情報を含みうるため、
 * この端末の中だけに保存し、外部のAIには送らない。
 */
export type CustomerReview = {
  /** accounts/…/locations/…/reviews/… */
  id: string;
  locationName: string;
  clinicId?: string;
  reviewerName: string;
  rating: number;
  comment: string;
  createTime: string;
  updateTime: string;
  reply?: { comment: string; updateTime: string };
  mode: DataMode;
};

/** Googleビジネスプロフィールの月ごとの数字（表示回数・電話・ルート検索など） */
export type PerformanceMonth = {
  clinicId: string;
  month: string;
  /** 指標 key → 回数 */
  values: Record<string, number>;
  mode: DataMode;
  updatedAt: string;
};

/** 地域の競合 */
export type Competitor = {
  id: string;
  /** どの院の競合か */
  clinicId: string;
  name: string;
  placeId?: string;
  address?: string;
  mapsUri?: string;
  note?: string;
  mode: DataMode;
  createdAt: string;
};

/**
 * 星の平均と口コミ件数の記録。
 * source = places（Google Maps Platform から取得）は規約に合わせて30日で消し、
 * manual（人が確認して記録）と gbp（自院のプロフィール）は残す。
 */
export type RatingSnapshot = {
  /** 競合の id、または自院は "clinic:<clinicId>" */
  subjectId: string;
  date: string;
  rating?: number;
  reviewCount?: number;
  source: "places" | "manual" | "gbp";
  mode: DataMode;
};

export type GoogleConnectionState = {
  connectedAt?: string;
  email?: string;
  lastSyncAt?: string;
  lastStatus?: "ok" | "error";
  lastMessage?: string;
};

export type ReputationData = {
  google: GoogleConnectionState;
  locations: GbpLocation[];
  reviews: CustomerReview[];
  performance: PerformanceMonth[];
  competitors: Competitor[];
  snapshots: RatingSnapshot[];
};

export function emptyReputation(): ReputationData {
  return { google: {}, locations: [], reviews: [], performance: [], competitors: [], snapshots: [] };
}

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
  clinicMonths: ClinicMonthRecord[];
  plan: PlanRecord[];
  dataSources: DataSourceState;
  reputation: ReputationData;
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
    clinicMonths: [],
    plan: [],
    dataSources: { sheets: [] },
    reputation: emptyReputation(),
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
  /** ESCALATE = 統括責任者が代表へ回す / RETURN = 代表が統括責任者の判断に任せる */
  decision: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED", "ESCALATE", "RETURN"]),
  comment: z.string().trim().max(500).optional(),
});
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>["decision"];

export const loginSchema = z.object({
  role: z.enum(["operator", "president"]),
  passcode: z.string().max(200).optional(),
  demo: z.boolean().optional(),
});

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "対象月が正しくありません");

/** CSVの取り込み（日計表のTOPシート または 事業計画書） */
export const importInputSchema = z.object({
  kind: z.enum(["daily", "plan"]),
  /** 日計表の対象月（事業計画書では不要） */
  month: monthSchema.optional(),
  fileName: z.string().trim().max(200).optional(),
  csv: z.string().min(1, "ファイルが空です").max(2_000_000, "ファイルが大きすぎます"),
});
export type ImportInput = z.infer<typeof importInputSchema>;

/** 月ごとの日計表（Googleスプレッドシート）の登録 */
export const sheetInputSchema = z.object({
  month: monthSchema,
  /** スプレッドシートのURL または ID。空文字なら登録を外す */
  url: z.string().trim().max(500),
  sheetName: z.string().trim().max(100).optional(),
});

/** 院の数字の手入力（入力した項目だけ上書き） */
export const manualInputSchema = z.object({
  month: monthSchema,
  clinicId: z.string().min(1).max(40),
  values: z.record(z.string().max(40), z.number().finite().min(-10_000_000_000).max(10_000_000_000)),
});
export type ManualInput = z.infer<typeof manualInputSchema>;

// ---- 口コミ・競合の入力 ----

export const replyDraftSchema = z.object({
  reviewId: z.string().min(1).max(300),
  comment: z.string().trim().min(1, "返信文を入力してください").max(4000, "返信文が長すぎます"),
});

export const locationMapSchema = z.object({
  locationName: z.string().min(1).max(200),
  clinicId: z.string().max(40),
});

export const competitorInputSchema = z.object({
  clinicId: z.string().min(1).max(40),
  name: z.string().trim().min(1, "名前を入力してください").max(120),
  placeId: z.string().trim().max(300).optional(),
  address: z.string().trim().max(300).optional(),
  mapsUri: z.string().trim().max(500).optional(),
  note: z.string().trim().max(300).optional(),
});

export const snapshotInputSchema = z.object({
  subjectId: z.string().min(1).max(80),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().min(0).max(1_000_000).optional(),
});

export const placesSearchSchema = z.object({
  query: z.string().trim().min(1, "検索する言葉を入力してください").max(120),
});
