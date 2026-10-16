/**
 * 「どの会社でも使える共通の仕組み」と「会社固有の設定」の境界。
 *
 * 会社固有の内容（会社名・理念・組織・部門・評価制度・指示の例・判断ルール・成果物テンプレート・承認ルール）は
 * すべて src/tenants/<会社>/ に置き、この型を満たす TenantConfig として src/tenant.ts から読み込む。
 * 別の会社へ導入するときは、tenants/ に新しいフォルダを作り src/tenant.ts の参照先を差し替える。
 */
import type { ApprovalCategory, Priority } from "@/lib/types";

/** 組織上の階層。president / operator は人間、それ以外はAI */
export type Tier = "president" | "operator" | "commander" | "leader" | "staff";

export type Member = {
  id: string;
  name: string;
  kana?: string;
  title: string;
  tier: Tier;
  /** 所属チーム（AI部門内のチーム。人間・司令塔は "hq"） */
  teamId: string;
  /** 上長の id */
  reportsTo: string | null;
  /** 担当領域。司令塔の割当判断に使う */
  skills: string[];
  /** false = 待機中。有効化には承認が必要 */
  active: boolean;
  /** 1日あたりのTask上限（AI社員の暴走防止） */
  dailyTaskLimit: number;
  isHuman?: boolean;
  /** 人物像（画面表示・将来のClaude API実装でのプロンプトに使う） */
  persona?: string;
};

export type Team = { id: string; name: string; short: string };

/** 事業部門（施策を分けて扱う単位） */
export type BusinessUnit = { id: string; name: string; short: string };

/** 院（数字を管理する単位） */
export type Clinic = {
  id: string;
  name: string;
  short: string;
  /** 日計表・事業計画書の行名と照合する文字列（含まれていれば一致） */
  aliases: string[];
  /** 開院月（YYYY-MM。これより前の月は対象外として表示） */
  openedMonth?: string;
  /** 院の特徴（例：巻き爪対応） */
  tags?: string[];
};

/**
 * 院ごとの指標の定義。日計表の見出しと照合して取り込む。
 * key の salesActual / salesTarget / salesForecast は共通の仕組みが売上目標の進捗に使う。
 */
export type MetricDef = {
  key: string;
  label: string;
  unit: "yen" | "count" | "percent";
  group: string;
  /** 見出し（全角・空白を正規化したもの）がこれで始まれば一致。長いものが優先 */
  aliases: string[];
  /** 全院合計の出し方：sum = 院の合計 / none = 合計しない（率・単価など） */
  total: "sum" | "none";
  /** 院別の表に既定で表示するか */
  primary?: boolean;
};

export type Milestone = {
  id: string;
  label: string;
  /**
   * task = この milestone を持つTaskが完了したら達成
   * approval = 指定カテゴリの承認が「代表の決裁」で承認されたら達成（AIの成果物だけでは達成にしない）
   */
  achievedBy: "task" | "approval";
  approvalCategory?: ApprovalCategory;
};

/** 業務の中で見つかった課題。優先度は影響×緊急度で算出し、対応状況は実際のTaskから判定する */
export type Issue = {
  id: string;
  title: string;
  detail: string;
  /** 1〜5 */
  impact: number;
  /** 1〜5 */
  urgency: number;
  /** この課題に取り組む指示の種類（intent） */
  intents: string[];
};

export type EvaluationAxis = { id: string; label: string; detail: string };
export type Grade = { code: string; name: string; summary: string };

export type ApproverRole = "operator" | "president";

export type ApprovalRecommendation = {
  approver: ApproverRole;
  /** true = 代表の決裁が必須（統括責任者は承認できず、却下・修正依頼・代表へ回すのみ） */
  presidentRequired: boolean;
  reason: string;
};

export type ApprovalPolicyInput = {
  category: ApprovalCategory;
  /** 月額または一回の費用（円） */
  costJpy: number;
  /** 法人（企業）向けか */
  corporate?: boolean;
  /** 患者情報・スタッフ評価などの機密情報を含むか */
  sensitive?: boolean;
};

// ---- 判断ルール・成果物テンプレート（DEMO MODE の「頭脳」） ----

export type TaskTemplate = {
  key: string;
  title: string;
  description: string;
  teamId: string;
  assigneeId: string;
  dependsOn?: string[];
  milestone?: string;
  requiresApproval?: ApprovalCategory;
  /** 承認時の補足（費用・法人向け・機密） */
  approvalMeta?: { costJpy?: number; corporate?: boolean; sensitive?: boolean; expectedEffect?: string; risk?: string };
  /** 事業部門ごとの内容を含む場合 */
  businessUnits?: string[];
  /** スタッフ評価など、閲覧者を限定すべき内容 */
  confidential?: boolean;
  demoRevision?: boolean;
  /** 成果物本文（revision = 修正回数） */
  body: (revision: number) => string;
  revisionComment?: string;
  approveComment: string;
};

export type IntentPlaybook = {
  intent: string;
  label: string;
  priority: Priority;
  priorityReason: string;
  understanding: string;
  concern?: string;
  /** 関連する課題（Issue.id） */
  issueIds?: string[];
  project: { title: string; objective: string; leadId: string };
  tasks: TaskTemplate[];
};

export type StaffingRule = {
  /** 有効化候補の社員 */
  memberId: string;
  /** この指示の種類が来たら、業務量に関係なく有効化を提案する */
  triggerIntents: string[];
  /** 業務量で判断する場合：このチームの未完了Taskがこの数以上 */
  loadTeamId?: string;
  loadThreshold?: number;
  reason: string;
  expectedEffect: string;
  monthlyCostJpy: number;
};

export type Playbook = {
  /** 指示文から意図を判定する（status_report / staffing / general は共通の予約語） */
  classifyIntent: (text: string) => string;
  intentLabels: Record<string, string>;
  playbooks: Record<string, IntentPlaybook>;
  /** 指示そのものへの反対意見 */
  extraConcern: (text: string) => string | undefined;
  staffing: StaffingRule[];
};

export type TenantConfig = {
  /** データファイル名・Cookie名などに使う識別子 */
  id: string;
  company: {
    name: string;
    shortName: string;
    philosophy: string;
    philosophyNote: string;
    businesses: string[];
    customers: string;
    futurePlan: string;
  };
  /** AI部門の名称・ミッション */
  division: { name: string; mission: string; focus: string };
  people: {
    presidentId: string;
    operatorId: string;
    commanderId: string;
  };
  mission: {
    id: string;
    code: string;
    title: string;
    policy: string;
    milestones: Milestone[];
  };
  revenueTarget: {
    label: string;
    amountJpy: number;
    /** 対象期間（両端を含む、YYYY-MM） */
    fromMonth: string;
    toMonth: string;
    scope: string;
    /** 部門別の目標（未確定なら null） */
    /** 現在の規模（ヒアリング結果） */
    currentScale: string;
  };
  businessUnits: BusinessUnit[];
  clinics: Clinic[];
  metrics: MetricDef[];
  /** 日計表の全院合計の行名（含まれていれば一致） */
  totalRowAliases: string[];
  /** 事業計画書の損益で、画面に表示する行（行名の前方一致） */
  planHighlights: string[];
  /** 予算の基準（1院あたりの月の売上予算の平均） */
  budget: { standardPerClinicJpy: number; label: string };
  /** 日計表で取り込むシート名（既定値） */
  dailySheetName: string;
  teams: Team[];
  members: Member[];
  /** チームごとのレビュー担当リーダー */
  reviewerByTeam: Record<string, string>;
  evaluation: { axes: EvaluationAxis[]; grades: Grade[]; principles: string[] };
  issues: Issue[];
  kpiCandidates: string[];
  commandExamples: string[];
  recommendApprover: (input: ApprovalPolicyInput) => ApprovalRecommendation;
  playbook: Playbook;
  /** 外部連携の候補（調査結果。実装は承認後） */
  dataSources: { name: string; detail: string; status: string }[];
  privacy: string[];
};
