import type { TenantConfig } from "@/lib/tenant-types";
import { recommendApprover } from "./approval-policy";
import { MEMBERS, REVIEWER_BY_TEAM, TEAMS } from "./organization";
import { CLINICS, METRICS, PLAN_HIGHLIGHTS, TOTAL_ROW_ALIASES } from "./numbers";
import { PLAYBOOK } from "./playbook";

/**
 * 株式会社Enejoy Hand 固有の設定。
 * ここ（tenants/enejoy-hand/）以外には、Enejoy Hand固有の名前・数字・ルールを書かない。
 */
const enejoyHand: TenantConfig = {
  id: "enejoy-hand",
  company: {
    name: "株式会社Enejoy Hand",
    shortName: "Enejoy Hand",
    philosophy: "心豊笑幸",
    philosophyNote: "会社に関わる全ての人を豊かに、笑顔にする",
    businesses: ["鍼灸・整骨院部門", "美容部門", "巻き爪部門"],
    customers: "現在は個人のお客様。今後は商品開発を進め、企業（法人）への営業も行う予定。",
    futurePlan:
      "この仕組みは、将来A.I.T companyが他社へ提供するサービスの最初の導入事例になる予定。事例化には代表の承認と匿名化が必要。",
  },
  division: {
    name: "AI部門",
    mission: "AIで業務を改善し、会社の土台を早急に作り上げる",
    focus: "キャリア制度・評価制度の確立",
  },
  people: { presidentId: "murakami", operatorId: "iwanaga", commanderId: "commander" },
  mission: {
    id: "MISSION-001",
    code: "MISSION 001",
    title: "スタッフの評価基準とクラス（等級）を確定させる",
    policy: "案は早く、確定は慎重に。試行評価と代表 村上の決裁を経て運用を始める。",
    milestones: [
      { id: "current", label: "現状把握（スタッフ構成・役割の整理）", achievedBy: "task" },
      { id: "axes", label: "評価軸5つと配点の案", achievedBy: "task" },
      { id: "grades", label: "クラス（等級）案と昇格条件", achievedBy: "task" },
      { id: "trial", label: "試行評価の進め方を決める", achievedBy: "task" },
      {
        id: "decision",
        label: "代表 村上の決裁で確定",
        achievedBy: "approval",
        approvalCategory: "staff_evaluation",
      },
    ],
  },
  revenueTarget: {
    label: "年間売上 3億円",
    amountJpy: 300_000_000,
    fromMonth: "2026-07",
    toMonth: "2027-06",
    scope: "全院合計（7院・鍼灸・整骨／美容／巻き爪を含む）",
    currentScale: "現在の年間売上：1億〜2億円（全部門合計・ヒアリング）",
  },
  businessUnits: [
    { id: "seikotsu", name: "鍼灸・整骨院部門", short: "鍼灸・整骨院" },
    { id: "beauty", name: "美容部門", short: "美容" },
    { id: "makizume", name: "巻き爪部門", short: "巻き爪" },
  ],
  clinics: CLINICS,
  metrics: METRICS,
  totalRowAliases: TOTAL_ROW_ALIASES,
  planHighlights: PLAN_HIGHLIGHTS,
  dailySheetName: "TOP",
  teams: TEAMS,
  members: MEMBERS,
  reviewerByTeam: REVIEWER_BY_TEAM,
  evaluation: {
    axes: [
      { id: "results", label: "数字（売上・指名・リピート）", detail: "個人売上・指名数・次回予約率・リピート率" },
      { id: "skill", label: "技術・資格", detail: "部門別の技術基準の到達度、国家資格・認定の取得" },
      { id: "philosophy", label: "理念・姿勢（心豊笑幸）", detail: "理念の体現、チームへの貢献、患者対応の姿勢" },
      { id: "development", label: "育成・マネジメント", detail: "後輩の指導、後継者としての役割、院運営への貢献" },
      { id: "pc", label: "PC管理", detail: "予約・会計・カルテの正確な入力、データ集計・管理" },
    ],
    grades: [
      { code: "C1", name: "研修生", summary: "基本施術の補助、接遇と理念の習得" },
      { code: "C2", name: "スタッフ", summary: "担当施術を一人で実施、入力を正確に" },
      { code: "C3", name: "一人前", summary: "指名・リピートで安定した数字、後輩の技術指導" },
      { code: "C4", name: "リーダー", summary: "チームの数字に責任、育成計画の実行" },
      { code: "C5", name: "院長・部門長", summary: "院・部門の売上と人材に責任、評価者" },
      { code: "C6", name: "統括", summary: "複数院・部門の統括、後継者育成、経営に参画" },
    ],
    principles: [
      "下位のクラスは技術・姿勢を、上位のクラスは数字・育成を重く評価する",
      "技術の基準は部門別（鍼灸・整骨院／美容／巻き爪）に定める",
      "評価・クラスの確定は代表 村上の決裁が必須",
      "評価データは機密。閲覧は本人・評価者・代表・統括責任者に限定する",
    ],
  },
  issues: [
    { id: "i-eval", title: "キャリアアップ制度・評価制度がなく、運用が自由すぎる", detail: "重点テーマ。MISSION 001で対応。", impact: 5, urgency: 5, intents: ["mission", "evaluation", "grade"] },
    { id: "i-acquisition", title: "集客が弱い", detail: "3億円達成の最大のボトルネック。", impact: 5, urgency: 4, intents: ["marketing", "revenue_plan", "product"] },
    { id: "i-money", title: "経理の管理が曖昧で、お金の流れが見えない", detail: "目標の進捗も投資判断もできない。", impact: 5, urgency: 4, intents: ["finance", "revenue_plan"] },
    { id: "i-admin", title: "事務員がおらず、事務作業が遅い", detail: "現場の施術・育成の時間を奪っている。", impact: 4, urgency: 4, intents: ["admin_ops"] },
    { id: "i-data", title: "データ集計が曖昧", detail: "部門別の売上・患者数を正しく追えない。", impact: 4, urgency: 4, intents: ["admin_ops", "finance", "revenue_plan"] },
    { id: "i-succession", title: "後継者育成ができていない", detail: "院長・部門長を任せられる人が育っていない。", impact: 5, urgency: 3, intents: ["succession", "mission", "grade"] },
    { id: "i-system", title: "システムが足りず、データを含めて管理ができていない", detail: "院によって管理方法がばらばら。", impact: 4, urgency: 3, intents: ["admin_ops"] },
    { id: "i-reviews", title: "口コミ・Googleマップ（MEO）の管理ができていない", detail: "返信の遅れ、競合との差が見えていない。", impact: 4, urgency: 4, intents: ["reviews"] },
    { id: "i-sns", title: "SNSの成果が出ない・続かない", detail: "担当とネタが決まっていない。", impact: 3, urgency: 3, intents: ["sns"] },
  ],
  kpiCandidates: [
    "部門別売上",
    "新規・リピート患者数",
    "SNS経由の集客数",
    "事務作業時間の削減量",
    "スタッフ評価の完了率",
  ],
  commandExamples: [
    "MISSION 001を進めて",
    "スタッフの評価制度を作って",
    "クラス（等級）の案を出して",
    "後継者育成の計画を立てて",
    "今月の集客を考えて",
    "SNSを続けられる仕組みを作って",
    "会社のお金の流れを整理して",
    "事務作業のムダを洗い出して",
    "3億円達成までの計画を立てて",
    "口コミと競合の状況を整理して",
    "課題を洗い出して優先順位をつけて",
    "今日の仕事を報告して",
  ],
  recommendApprover,
  playbook: PLAYBOOK,
  dataSources: [
    {
      name: "日計表（Googleスプレッドシート・月ごとのファイル）",
      detail: "TOPシートの院別・全院の目標・累計実績・着地予想・新患・来院・巻き爪・自賠・口コミ・LTV・キャンセル。",
      status: "読み取りのみで自動同期（数字画面で月ごとのファイルを登録）",
    },
    {
      name: "事業計画書（院別の月次売上計画・損益）",
      detail: "Excel を CSV で保存して取り込む。院別の売上計画と、売上総利益・人件費・販管費などの損益。",
      status: "CSV取り込みに対応",
    },
    {
      name: "POS「サロエボ2」（エクストリンク）",
      detail: "全院の売上・予約状況。CSV出力の項目を確認後、集計値のみを取り込む（患者個人の情報は取り込まない）。",
      status: "CSVの見本を確認してから対応",
    },
    {
      name: "あんど整骨院 予約・会計システム（同リポジトリ）",
      detail: "予約・会計・回数券・スタッフ・口コミ記録（Supabase）。",
      status: "一部の院で使用。連携は承認後",
    },
  ],
  privacy: [
    "患者さんの健康・施術に関する情報は要配慮個人情報。DEMO MODEでは架空のデータのみを使う。",
    "実データを扱う前に、アクセス制御・保存先・外部AIへの送信範囲を説明し、代表 村上の承認を得る。",
    "スタッフの評価データは機密。閲覧は本人・評価者・代表・統括責任者に限定する。",
    "Enejoy Handの患者情報・スタッフ情報・経営数値は、社外資料やA.I.T company側のデータに流用しない（事例化は代表の承認後、匿名化・数値加工のうえ行う）。",
  ],
};

export default enejoyHand;
