import type { Clinic, MetricDef } from "@/lib/tenant-types";

/**
 * Enejoy Hand の数字の管理単位（院）と、日計表（EnejoyHand様日計表）の指標。
 * 日計表・事業計画書の行名・見出しが変わったら、ここの aliases を直す。
 */

export const CLINICS: Clinic[] = [
  { id: "honin", name: "本院", short: "本院", aliases: ["本院"] },
  { id: "taguchiyama", name: "田口山院", short: "田口山", aliases: ["田口山"], tags: ["巻き爪"] },
  { id: "katano", name: "交野院", short: "交野", aliases: ["交野"] },
  { id: "ibaraki", name: "茨木院", short: "茨木", aliases: ["茨木"], tags: ["巻き爪"] },
  { id: "tsuda", name: "津田院", short: "津田", aliases: ["津田"] },
  { id: "owada", name: "大和田院", short: "大和田", aliases: ["大和田"] },
  { id: "korien", name: "香里園院", short: "香里園", aliases: ["香里園"], openedMonth: "2026-10" },
];

/** 日計表の全院合計の行 */
export const TOTAL_ROW_ALIASES = ["全院", "全体", "合計", "全店"];

export const METRICS: MetricDef[] = [
  // 売上
  { key: "salesTarget", label: "目標売上", unit: "yen", group: "売上", aliases: ["目標売上"], total: "sum", primary: true },
  { key: "cumTarget", label: "累計目標", unit: "yen", group: "売上", aliases: ["累計目標"], total: "sum" },
  { key: "salesActual", label: "累計実績", unit: "yen", group: "売上", aliases: ["累計実績"], total: "sum", primary: true },
  { key: "salesForecast", label: "着地予想", unit: "yen", group: "売上", aliases: ["着地予想"], total: "sum", primary: true },
  { key: "unitPrice", label: "単価", unit: "yen", group: "売上", aliases: ["単価"], total: "none" },
  { key: "ltv", label: "月間LTV", unit: "yen", group: "売上", aliases: ["月間LTV"], total: "none" },
  { key: "refunds", label: "返金", unit: "yen", group: "売上", aliases: ["返金"], total: "sum" },
  // 患者
  { key: "receipts", label: "レセ枚数", unit: "count", group: "患者", aliases: ["レセ枚数", "レセ"], total: "sum" },
  { key: "avgVisits", label: "平均来院数", unit: "count", group: "患者", aliases: ["平均来院数"], total: "none" },
  { key: "newPatients", label: "新患数", unit: "count", group: "患者", aliases: ["新患数", "新患"], total: "sum", primary: true },
  { key: "revisits", label: "再診数", unit: "count", group: "患者", aliases: ["再診数", "再診"], total: "sum" },
  { key: "monthFirst", label: "今月初", unit: "count", group: "患者", aliases: ["今月初"], total: "sum" },
  { key: "totalVisits", label: "総来院数", unit: "count", group: "患者", aliases: ["総来院数"], total: "sum", primary: true },
  { key: "cancels", label: "キャンセル数", unit: "count", group: "患者", aliases: ["キャンセル数"], total: "sum" },
  { key: "cancelRate", label: "キャンセル率", unit: "percent", group: "患者", aliases: ["キャンセル率"], total: "none", primary: true },
  // 巻き爪
  { key: "makiNew", label: "巻き爪 新規", unit: "count", group: "巻き爪", aliases: ["巻き爪(新規)", "巻爪(新規)"], total: "sum" },
  { key: "makiCont", label: "巻き爪 継続", unit: "count", group: "巻き爪", aliases: ["巻き爪(継続)", "巻爪(継続)"], total: "sum" },
  { key: "makiSales", label: "巻き爪 売上", unit: "yen", group: "巻き爪", aliases: ["巻き爪(売上)", "巻爪(売上)"], total: "sum", primary: true },
  // 自賠
  { key: "jibaiNew", label: "自賠 新規", unit: "count", group: "自賠", aliases: ["自賠新規"], total: "sum" },
  { key: "jibaiMonthFirst", label: "自賠 今月初", unit: "count", group: "自賠", aliases: ["自賠今月初"], total: "sum" },
  { key: "jibaiCont", label: "自賠 継続", unit: "count", group: "自賠", aliases: ["自賠継続"], total: "sum" },
  { key: "jibaiSales", label: "自賠 売上", unit: "yen", group: "自賠", aliases: ["自賠売上"], total: "sum", primary: true },
  // 口コミ
  { key: "googleReviews", label: "Google口コミ", unit: "count", group: "口コミ", aliases: ["google口コミ", "google"], total: "sum" },
  { key: "hpbReviews", label: "HPB口コミ", unit: "count", group: "口コミ", aliases: ["hpb口コミ", "hpb"], total: "sum" },
];

/** 事業計画書の損益で、画面に出す行（前方一致） */
export const PLAN_HIGHLIGHTS = ["売上合計", "売上総利益", "給料合計", "販売費", "給与+販管費", "営業利益", "経常利益"];
