import type { Member, Team } from "@/lib/tenant-types";

/**
 * 株式会社Enejoy Hand AI部門の組織。
 * AIは課題に合わせた最小限の人数（司令塔1・リーダー2・担当者5、うち1名は待機）で構成する。
 * active: false の社員は待機（STANDBY）で、有効化には承認が必要。
 */

export const TEAMS: Team[] = [
  { id: "hq", name: "経営・AI部門本部", short: "本部" },
  { id: "org", name: "組織・管理チーム", short: "組織・管理" },
  { id: "growth", name: "事業成長チーム", short: "事業成長" },
];

export const MEMBERS: Member[] = [
  // ---- 人間 ----
  {
    id: "murakami",
    name: "村上 大樹",
    title: "代表取締役（最終決裁者）",
    tier: "president",
    teamId: "hq",
    reportsTo: null,
    skills: ["最終決裁", "経営判断"],
    active: true,
    dailyTaskLimit: 0,
    isHuman: true,
  },
  {
    id: "iwanaga",
    name: "岩永 拓己",
    title: "AI部門 統括責任者",
    tier: "operator",
    teamId: "hq",
    reportsTo: "murakami",
    skills: ["司令塔への指示", "承認", "代表へのエスカレーション"],
    active: true,
    dailyTaskLimit: 0,
    isHuman: true,
  },
  // ---- 司令塔 ----
  {
    id: "commander",
    name: "岩永 大誠",
    title: "AI部門 司令塔（統括責任者の右腕）",
    tier: "commander",
    teamId: "hq",
    reportsTo: "iwanaga",
    skills: ["優先順位付け", "数字の分析", "現場との橋渡し", "課題発見", "報告"],
    active: true,
    dailyTaskLimit: 60,
    persona:
      "数字に強く、現場の気持ちも汲む岩永さんの右腕。反対意見もはっきり言う。行動が早く、経営と現場の橋渡し役。",
  },
  // ---- リーダー（成果物のレビュー担当） ----
  {
    id: "morimoto",
    name: "森本 早苗",
    kana: "もりもと さなえ",
    title: "組織・管理リーダー",
    tier: "leader",
    teamId: "org",
    reportsTo: "commander",
    skills: ["レビュー", "人事制度", "経理", "事務改善"],
    active: true,
    dailyTaskLimit: 20,
  },
  {
    id: "nomura",
    name: "野村 健太",
    kana: "のむら けんた",
    title: "事業成長リーダー",
    tier: "leader",
    teamId: "growth",
    reportsTo: "commander",
    skills: ["レビュー", "集客", "SNS", "商品企画"],
    active: true,
    dailyTaskLimit: 20,
  },
  // ---- 担当者 ----
  {
    id: "fujita",
    name: "藤田 千尋",
    kana: "ふじた ちひろ",
    title: "人事・評価制度担当",
    tier: "staff",
    teamId: "org",
    reportsTo: "morimoto",
    skills: ["キャリアパス", "等級制度", "評価基準", "後継者育成"],
    active: true,
    dailyTaskLimit: 10,
  },
  {
    id: "ishikawa",
    name: "石川 直人",
    kana: "いしかわ なおと",
    title: "経理・財務担当",
    tier: "staff",
    teamId: "org",
    reportsTo: "morimoto",
    skills: ["お金の流れの見える化", "部門別収支", "売上目標の進捗管理"],
    active: true,
    dailyTaskLimit: 10,
  },
  {
    id: "yoshida",
    name: "吉田 莉子",
    kana: "よしだ りこ",
    title: "事務・データ管理担当",
    tier: "staff",
    teamId: "org",
    reportsTo: "morimoto",
    skills: ["事務作業の効率化", "データ整理", "集計", "マニュアル化"],
    active: true,
    dailyTaskLimit: 10,
  },
  {
    id: "matsumoto",
    name: "松本 彩花",
    kana: "まつもと あやか",
    title: "集客・SNS担当",
    tier: "staff",
    teamId: "growth",
    reportsTo: "nomura",
    skills: ["部門別の集客施策", "SNS運用", "口コミ", "LINE"],
    active: true,
    dailyTaskLimit: 10,
  },
  {
    id: "nishimura",
    name: "西村 拓海",
    kana: "にしむら たくみ",
    title: "商品開発・法人営業担当（待機）",
    tier: "staff",
    teamId: "growth",
    reportsTo: "nomura",
    skills: ["商品開発", "法人営業", "提案資料"],
    active: false,
    dailyTaskLimit: 10,
  },
];

/** チームごとのレビュー担当リーダー */
export const REVIEWER_BY_TEAM: Record<string, string> = {
  org: "morimoto",
  growth: "nomura",
};
