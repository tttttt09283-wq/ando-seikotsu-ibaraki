/**
 * A.I.T company の基本情報・組織構成。
 * 組織は初期段階として必要最小限の人数で構成する。
 * active: false の社員は「待機（STANDBY）」扱いで、有効化には CEO 承認が必要。
 */

export const COMPANY = {
  name: "A.I.T company",
  ceo: "岩永 拓己",
  philosophy: "自由に、自分たちが楽しい。",
  domains: ["AI自動業務改善", "SNSマーケティング", "販促・プロモーション支援"],
} as const;

export const MISSION_001 = {
  id: "MISSION-001",
  code: "MISSION 001",
  title: "知らない顧客から、A.I.T companyとして最初の1円を生み出す。",
  monthlyRevenueTargetJpy: 100_000,
  firstRevenueTargetJpy: 1,
  policy: "最初は利益を生み出せる仕組みの構築を優先する。",
  /** MISSION 進捗を測るマイルストーン（実データの達成状況で判定する） */
  milestones: [
    { id: "offer", label: "売れる商品・サービスを1つ決める" },
    { id: "target", label: "狙う顧客層と集客チャネルを決める" },
    { id: "pipeline", label: "見込み顧客リストと提案文を用意する" },
    { id: "first-contact", label: "CEO承認のうえ、最初の提案を送る" },
    { id: "first-yen", label: "知らない顧客から最初の1円を受け取る" },
  ],
} as const;

export type MilestoneId = (typeof MISSION_001.milestones)[number]["id"];

export type DepartmentId = "executive" | "sales" | "ai" | "admin";

export const DEPARTMENTS: Record<DepartmentId, { name: string; short: string }> = {
  executive: { name: "経営本部", short: "経営" },
  sales: { name: "営業・マーケティング部", short: "営業" },
  ai: { name: "AI開発・業務改善部", short: "AI" },
  admin: { name: "財務・人事部", short: "財務" },
};

export type Tier = "ceo" | "chad" | "executive" | "manager" | "staff";

export const TIER_LABEL: Record<Tier, string> = {
  ceo: "CEO",
  chad: "司令塔",
  executive: "AI役員",
  manager: "AIマネージャー",
  staff: "AI社員",
};

export type Member = {
  id: string;
  name: string;
  kana?: string;
  title: string;
  tier: Tier;
  department: DepartmentId;
  /** 上長の id */
  reportsTo: string | null;
  /** 担当領域。CHAD の割当判断に使う */
  skills: string[];
  /** false = 待機中。有効化には CEO 承認が必要 */
  active: boolean;
  /** 1日あたりのTask上限（AI社員の暴走防止） */
  dailyTaskLimit: number;
  /** 人間の CEO は AI ではない */
  isHuman?: boolean;
};

export const MEMBERS: Member[] = [
  {
    id: "ceo",
    name: "岩永 拓己",
    title: "CEO",
    tier: "ceo",
    department: "executive",
    reportsTo: null,
    skills: ["経営判断", "承認"],
    active: true,
    dailyTaskLimit: 0,
    isHuman: true,
  },
  {
    id: "chad",
    name: "CHAD",
    title: "CEOの右腕・会社全体の司令塔",
    tier: "chad",
    department: "executive",
    reportsTo: "ceo",
    skills: ["経営", "営業", "AI", "財務", "優先順位付け", "報告"],
    active: true,
    dailyTaskLimit: 60,
  },
  // ---- AI役員 ----
  {
    id: "kamiya",
    name: "神谷 蓮",
    kana: "かみや れん",
    title: "CMO / CRO",
    tier: "executive",
    department: "sales",
    reportsTo: "chad",
    skills: ["営業", "SNS", "販促", "市場調査"],
    active: true,
    dailyTaskLimit: 20,
  },
  {
    id: "shiraishi",
    name: "白石 凛",
    kana: "しらいし りん",
    title: "CTO / CAIO",
    tier: "executive",
    department: "ai",
    reportsTo: "chad",
    skills: ["AI開発", "業務改善", "自動化"],
    active: true,
    dailyTaskLimit: 20,
  },
  {
    id: "kuroda",
    name: "黒田 慎吾",
    kana: "くろだ しんご",
    title: "CFO / CHRO",
    tier: "executive",
    department: "admin",
    reportsTo: "chad",
    skills: ["財務", "人事", "組織管理", "価格設計"],
    active: true,
    dailyTaskLimit: 20,
  },
  // ---- AIマネージャー ----
  {
    id: "sato",
    name: "佐藤 美咲",
    kana: "さとう みさき",
    title: "営業・マーケティング マネージャー",
    tier: "manager",
    department: "sales",
    reportsTo: "kamiya",
    skills: ["レビュー", "営業", "SNS"],
    active: true,
    dailyTaskLimit: 20,
  },
  {
    id: "ito",
    name: "伊藤 大和",
    kana: "いとう やまと",
    title: "AI開発 マネージャー",
    tier: "manager",
    department: "ai",
    reportsTo: "shiraishi",
    skills: ["レビュー", "AI開発", "業務改善"],
    active: true,
    dailyTaskLimit: 20,
  },
  {
    id: "yamamoto",
    name: "山本 さくら",
    kana: "やまもと さくら",
    title: "財務・人事 マネージャー",
    tier: "manager",
    department: "admin",
    reportsTo: "kuroda",
    skills: ["レビュー", "財務", "価格設計"],
    active: true,
    dailyTaskLimit: 20,
  },
  // ---- AI社員 ----
  {
    id: "takahashi",
    name: "高橋 陽斗",
    kana: "たかはし はると",
    title: "市場調査・営業リサーチ担当",
    tier: "staff",
    department: "sales",
    reportsTo: "sato",
    skills: ["市場調査", "競合分析", "営業リスト", "提案文"],
    active: true,
    dailyTaskLimit: 8,
  },
  {
    id: "nakamura",
    name: "中村 葵",
    kana: "なかむら あおい",
    title: "SNS・コンテンツ担当",
    tier: "staff",
    department: "sales",
    reportsTo: "sato",
    skills: ["SNS", "コンテンツ", "販促", "集客"],
    active: true,
    dailyTaskLimit: 8,
  },
  {
    id: "kobayashi",
    name: "小林 結衣",
    kana: "こばやし ゆい",
    title: "AI自動化エンジニア",
    tier: "staff",
    department: "ai",
    reportsTo: "ito",
    skills: ["自動化", "業務改善", "サービス設計", "AI開発"],
    active: true,
    dailyTaskLimit: 8,
  },
  {
    id: "watanabe",
    name: "渡辺 翔",
    kana: "わたなべ しょう",
    title: "財務分析・価格設計担当",
    tier: "staff",
    department: "admin",
    reportsTo: "yamamoto",
    skills: ["財務", "価格設計", "KPI", "コスト管理"],
    active: true,
    dailyTaskLimit: 8,
  },
  {
    id: "kato",
    name: "加藤 美月",
    kana: "かとう みづき",
    title: "SNS運用担当（増員候補）",
    tier: "staff",
    department: "sales",
    reportsTo: "sato",
    skills: ["SNS", "投稿運用"],
    active: false,
    dailyTaskLimit: 8,
  },
];

export function getMember(id: string): Member | undefined {
  return MEMBERS.find((m) => m.id === id);
}

export function requireMember(id: string): Member {
  const m = getMember(id);
  if (!m) throw new Error(`Unknown member: ${id}`);
  return m;
}

/** 部署ごとのレビュー担当マネージャー */
export const REVIEWER_BY_DEPARTMENT: Record<Exclude<DepartmentId, "executive">, string> = {
  sales: "sato",
  ai: "ito",
  admin: "yamamoto",
};

/** 部署ごとの担当役員 */
export const EXECUTIVE_BY_DEPARTMENT: Record<Exclude<DepartmentId, "executive">, string> = {
  sales: "kamiya",
  ai: "shiraishi",
  admin: "kuroda",
};
