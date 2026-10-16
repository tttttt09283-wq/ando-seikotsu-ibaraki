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

export type ApprovalPayload =
  | { kind: "review_reply"; reviewId: string; comment: string }
  /** 院別予算の確定（承認された内容＝この payload の予算をそのまま確定する） */
  | { kind: "budget_confirm"; standardJpy: number; perStaffJpy: number; cells: BudgetCell[]; label: string; note?: string }
  /** 中期事業計画の採用（承認された時点のシナリオをそのまま採用する） */
  | { kind: "plan_adopt"; scenario: MidPlanScenario; note?: string };

/** 院・月ごとの売上予算（staff = その月の施術者の人数。人員から予算を計算するときに使う） */
export type BudgetCell = { month: string; clinicId: string; amountJpy: number; staff?: number };

/** 確定した予算の版（当初予算・修正予算①…） */
export type BudgetVersion = {
  label: string;
  standardJpy: number;
  perStaffJpy: number;
  cells: BudgetCell[];
  confirmedAt: string;
  approvalId: string;
  note?: string;
};

/** 院の追加・開院月・閉院月の変更（設定ファイルの院に上書きする） */
export type ClinicSetup = {
  added: { id: string; name: string; short: string; aliases: string[]; openedMonth?: string; closedMonth?: string; tags?: string[]; block?: string }[];
  overrides: Record<string, { openedMonth?: string | null; closedMonth?: string | null; block?: string | null }>;
};

/**
 * 会社の予算（院別・月別の売上予算）。
 * confirmed = 承認を経て確定した予算 / draft = 編集中の案。
 * 確定していない院・月は、基準額（1院あたりの月平均）で計算する。
 */
export type BudgetState = {
  /** 今の確定予算（最新の版） */
  confirmed: BudgetVersion | null;
  /** これまでに確定した版（古い順。最初が当初予算） */
  history: BudgetVersion[];
  draft: { standardJpy: number; perStaffJpy: number; cells: BudgetCell[]; updatedAt: string; updatedBy: string } | null;
};

// ---- 管理項目（KPI）・人員（組織図）・中期事業計画 ----

/**
 * 管理項目で使える数字の系列。日計表などの指標の key に加えて、次の特別な系列が使える。
 * budget = 今の確定予算 / staff = 施術者数（組織図→予算の人員） / lastYearSales = 前年同月の売上
 */
export const SPECIAL_SERIES: Record<string, string> = { budget: "予算", staff: "施術者数", lastYearSales: "前年同月の売上" };

export type KpiUnit = "yen" | "count" | "percent" | "person";

/** 管理項目（KPI）の定義。院別×月で値・目標・達成を見る */
export type KpiDef = {
  id: string;
  name: string;
  unit: KpiUnit;
  /** series = 数字をそのまま／ratio = 分子÷分母（単位が % なら ×100）／manual = 手入力 */
  calc: { kind: "series"; key: string } | { kind: "ratio"; numerator: string; denominator: string } | { kind: "manual" };
  /** 高いほど良い（up）／低いほど良い（down） */
  direction: "up" | "down";
  /** 目標：固定値、または系列（例：売上の目標＝予算） */
  target?: { kind: "value"; value: number } | { kind: "series"; key: string };
  /** 院ごとの目標（固定値の上書き） */
  clinicTargets?: Record<string, number>;
  note?: string;
  /** 使わなくなった項目（表示しない。記録は残す） */
  archived?: boolean;
};

/** defs = null の間は会社の標準の管理項目（設定ファイル）を使う */
export type KpiState = { defs: KpiDef[] | null };

/** 組織図の役割（人数だけを数える。名前は保存しない） */
export type StaffRole = "director" | "deputy" | "therapist" | "short" | "part" | "reception" | "receptionPart";

export type OrgCounts = Partial<Record<StaffRole, number>>;

/**
 * 組織図から数えた院ごとの人数。スタッフの氏名は保存せず、人数と施術者の換算人数（fte）だけを持つ。
 * kind = actual（その月からの実際の配置）／plan（出店時・理想などの計画）
 */
export type OrgSnapshot = {
  id: string;
  month: string;
  kind: "actual" | "plan";
  label: string;
  clinics: { clinicId: string; counts: OrgCounts; fte: number }[];
  /** 院として分からなかった列（新店舗など） */
  unmatched: { label: string; counts: OrgCounts; fte: number }[];
  importedAt: string;
  importedBy: string;
};

export type OrgState = { snapshots: OrgSnapshot[] };

/** 中期計画の新店（立ち上がり：開院月の月商から、rampMonths か月かけて成熟時の月商まで直線で伸びる） */
export type MidPlanNewStore = {
  id: string;
  name: string;
  openMonth: string;
  startJpy: number;
  matureJpy: number;
  rampMonths: number;
  /** 施術者の人数（換算） */
  staff: number;
};

/** 中期計画の1年度（来期以降。今期は予算と実績から計算する） */
export type MidPlanYear = {
  /** 期首 YYYY-MM */
  fyStart: string;
  /** 既存店の成長率（前年比。1.05 = 105%） */
  growthRate: number;
  /** 院ごとの成長率（上書き） */
  clinicGrowth: Record<string, number>;
  /** 院ごとの施術者数（年平均・換算人数。未入力は前年のまま） */
  staff: Record<string, number>;
  /** 取り込んだ院別・月別の計画（12か月。あれば成長率の計算より優先） */
  monthly: Record<string, number[]>;
  /** この年度の売上目標（任意） */
  targetJpy?: number;
  note?: string;
};

export type MidPlanScenario = {
  id: string;
  name: string;
  years: MidPlanYear[];
  newStores: MidPlanNewStore[];
  /** 利益の目安：施術者1人あたりの年間人件費・その他経費率（売上に対する%）。未設定なら利益は出さない */
  laborPerStaffYearJpy?: number;
  otherCostRate?: number;
  note?: string;
  updatedAt: string;
  updatedBy: string;
};

export type MidPlanState = {
  scenarios: MidPlanScenario[];
  /** 承認を経て採用した計画（承認時点の内容） */
  adopted: { scenario: MidPlanScenario; approvalId: string; at: string; note?: string } | null;
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
  budget: BudgetState;
  clinicSetup: ClinicSetup;
  kpis: KpiState;
  org: OrgState;
  midPlan: MidPlanState;
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
    budget: { confirmed: null, history: [], draft: null },
    clinicSetup: { added: [], overrides: {} },
    kpis: { defs: null },
    org: { snapshots: [] },
    midPlan: { scenarios: [], adopted: null },
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

// ---- 予算 ----

const budgetAmount = z.number().int("予算は円単位の整数で入力してください").min(0).max(1_000_000_000);

const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;

export const budgetInputSchema = z.discriminatedUnion("action", [
  /** 案の編集（指定したセルの予算・人員だけ上書き。基準額・1人あたり売上も変えられる） */
  z.object({
    action: z.literal("edit"),
    cells: z
      .array(
        z.object({
          month: z.string().regex(monthRe),
          clinicId: z.string().min(1).max(40),
          amountJpy: budgetAmount.optional(),
          /** 施術者の人数（null で消す） */
          staff: z.number().min(0).max(200).nullable().optional(),
        }),
      )
      .max(1000),
    standardJpy: budgetAmount.optional(),
    perStaffJpy: budgetAmount.optional(),
  }),
  /** すべての院・月を基準額で埋める */
  z.object({ action: z.literal("fill_standard"), standardJpy: budgetAmount }),
  /** 人員 × 1人あたりの売上で予算を計算する */
  z.object({ action: z.literal("apply_staff"), perStaffJpy: budgetAmount.optional(), clinicIds: z.array(z.string().max(40)).max(100).optional() }),
  /** 予算表（CSV）の取り込み */
  z.object({
    action: z.literal("import"),
    csv: z.string().max(2_000_000, "ファイルが大きすぎます").optional(),
    /** GoogleスプレッドシートのURL（タブを開いた状態のURL） */
    url: z.string().trim().max(500).optional(),
    unit: z.enum(["auto", "yen", "thousand", "man"]),
    fileName: z.string().trim().max(200).optional(),
    /** 来期以降の計画を入れる中期計画のシナリオ（省略時は最初のシナリオ） */
    scenarioId: z.string().max(40).optional(),
  }),
  z.object({ action: z.literal("discard") }),
  /** 案の確定を承認依頼する */
  z.object({ action: z.literal("request"), note: z.string().trim().max(300).optional() }),
]);

/** 院の設定（店舗展開・閉院） */
export const clinicInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    name: z.string().trim().min(1, "院の名前を入力してください").max(40),
    short: z.string().trim().max(20).optional(),
    openedMonth: z.string().regex(monthRe).optional(),
    tags: z.array(z.string().trim().max(20)).max(5).optional(),
  }),
  z.object({
    action: z.literal("update"),
    id: z.string().min(1).max(40),
    openedMonth: z.string().regex(monthRe).nullable().optional(),
    closedMonth: z.string().regex(monthRe).nullable().optional(),
    /** ブロック（ブロックマネージャーの担当の単位。null で外す） */
    block: z.string().trim().max(20).nullable().optional(),
  }),
  z.object({ action: z.literal("remove"), id: z.string().min(1).max(40) }),
]);

// ---- 管理項目・人員・中期事業計画 ----

/** 取り込み元：CSVの中身、または GoogleスプレッドシートのURL（タブを開いた状態のURL） */
const sheetSource = {
  csv: z.string().max(2_000_000, "ファイルが大きすぎます").optional(),
  url: z.string().trim().max(500).optional(),
  fileName: z.string().trim().max(200).optional(),
};
const seriesKey = z.string().min(1).max(40);
const kpiDefSchema = z.object({
  id: z.string().min(1).max(40).optional(),
  name: z.string().trim().min(1, "名前を入力してください").max(40),
  unit: z.enum(["yen", "count", "percent", "person"]),
  calc: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("series"), key: seriesKey }),
    z.object({ kind: z.literal("ratio"), numerator: seriesKey, denominator: seriesKey }),
    z.object({ kind: z.literal("manual") }),
  ]),
  direction: z.enum(["up", "down"]),
  target: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("value"), value: z.number().finite().min(0).max(10_000_000_000) }),
      z.object({ kind: z.literal("series"), key: seriesKey }),
    ])
    .optional(),
  clinicTargets: z.record(z.string().max(40), z.number().finite().min(0).max(10_000_000_000)).optional(),
  note: z.string().trim().max(200).optional(),
});

export const kpiInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), def: kpiDefSchema }),
  z.object({ action: z.literal("remove"), id: z.string().min(1).max(40) }),
  z.object({ action: z.literal("move"), id: z.string().min(1).max(40), dir: z.union([z.literal(-1), z.literal(1)]) }),
  z.object({ action: z.literal("reset") }),
  z.object({
    action: z.literal("value"),
    kpiId: z.string().min(1).max(40),
    month: z.string().regex(monthRe),
    clinicId: z.string().min(1).max(40),
    value: z.number().finite().min(-10_000_000_000).max(10_000_000_000).nullable(),
  }),
]);

export const orgInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("import"),
    ...sheetSource,
    month: z.string().regex(monthRe, "適用する月を選んでください"),
    kind: z.enum(["actual", "plan"]),
    label: z.string().trim().max(60).optional(),
  }),
  z.object({ action: z.literal("remove"), id: z.string().min(1).max(40) }),
  z.object({ action: z.literal("apply_budget"), id: z.string().min(1).max(40) }),
  z.object({ action: z.literal("apply_plan"), id: z.string().min(1).max(40), scenarioId: z.string().min(1).max(40), fyStart: z.string().regex(monthRe) }),
]);

const rate = z.number().finite().min(0.5, "成長率は50%〜300%で入力してください").max(3, "成長率は50%〜300%で入力してください");
const yen = z.number().finite().int().min(0).max(100_000_000_000);
export const planInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name: z.string().trim().min(1, "名前を入力してください").max(30), copyFrom: z.string().max(40).optional() }),
  z.object({
    action: z.literal("update"),
    id: z.string().min(1).max(40),
    name: z.string().trim().min(1).max(30).optional(),
    note: z.string().trim().max(500).optional(),
    laborPerStaffYearJpy: yen.nullable().optional(),
    otherCostRate: z.number().finite().min(0).max(100).nullable().optional(),
    years: z
      .array(
        z.object({
          fyStart: z.string().regex(monthRe),
          growthRate: rate.optional(),
          clinicGrowth: z.record(z.string().max(40), rate.nullable()).optional(),
          staff: z.record(z.string().max(40), z.number().finite().min(0).max(200).nullable()).optional(),
          targetJpy: yen.nullable().optional(),
          note: z.string().trim().max(300).optional(),
          clearMonthly: z.array(z.string().max(40)).max(100).optional(),
        }),
      )
      .max(10)
      .optional(),
    newStores: z
      .array(
        z.object({
          id: z.string().max(40).optional(),
          name: z.string().trim().min(1, "新店の名前を入力してください").max(40),
          openMonth: z.string().regex(monthRe, "開院月を選んでください"),
          startJpy: yen,
          matureJpy: yen,
          rampMonths: z.number().int().min(0).max(60),
          staff: z.number().finite().min(0).max(100),
        }),
      )
      .max(20)
      .optional(),
  }),
  z.object({ action: z.literal("remove"), id: z.string().min(1).max(40) }),
  z.object({ action: z.literal("request_adopt"), id: z.string().min(1).max(40), note: z.string().trim().max(300).optional() }),
]);
