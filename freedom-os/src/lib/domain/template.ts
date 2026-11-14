// 初期テンプレート（マンダラ未登録のときだけ投入する）
import type { AreaCode, CriterionCode, GoalCode, KpiDirection } from "../types";

export interface TemplateAction {
  title: string;
  due: string;
  priority?: 1 | 2 | 3;
  kpi?: { name: string; target: number; unit: string; source?: string; direction?: KpiDirection };
  description?: string;
}
export interface TemplateGoal {
  code: GoalCode;
  title: string;
  category: string;
  actions: TemplateAction[];
}

export const CENTER_GOAL =
  "2030年までに、AI×鍼灸・整体で年間事業所得1,200万円を目指し、家族時間と自由を確保できるひとり経営者になる";

export const TEMPLATE_GOALS: TemplateGoal[] = [
  {
    code: "A",
    title: "鍼灸・整体事業",
    category: "施術",
    actions: [
      { title: "施術コンセプト決定", due: "2027-01-31", priority: 1, description: "誰の・どんな悩みを・どう解決するかを1文で言える状態にする" },
      { title: "専門メニュー設計", due: "2027-02-28", priority: 1 },
      { title: "自宅開業条件の確認", due: "2027-01-31", priority: 1, description: "自宅1階6畳の利用条件（施術所の構造設備基準、近隣・家族の合意、動線）" },
      { title: "料金体系の確立", due: "2027-03-31", priority: 2 },
      { title: "予約システム導入", due: "2027-04-30", priority: 2 },
      { title: "月間新患獲得目標の達成", due: "2027-12-31", kpi: { name: "新患数／月", target: 8, unit: "人", source: "new_patients" } },
      { title: "継続顧客60人を目指す", due: "2029-12-31", kpi: { name: "継続患者数", target: 60, unit: "人", source: "active_patients" } },
      { title: "月商80万円を達成", due: "2030-06-30", priority: 1, kpi: { name: "施術月商", target: 800000, unit: "円", source: "clinic_revenue" } },
    ],
  },
  {
    code: "B",
    title: "AI事業",
    category: "AI",
    actions: [
      { title: "AI商品コンセプト決定", due: "2026-12-31", priority: 1 },
      { title: "Claude Code開発環境構築", due: "2026-12-31", priority: 1 },
      { title: "最初のMVP完成", due: "2027-03-31", priority: 1 },
      { title: "有料顧客1社獲得", due: "2027-04-30", priority: 1, kpi: { name: "累計契約社数", target: 1, unit: "社", source: "ai_cumulative_contracts" } },
      { title: "導入実績3社", due: "2027-12-31", kpi: { name: "累計契約社数", target: 3, unit: "社", source: "ai_cumulative_contracts" } },
      { title: "AI事業月商10万円", due: "2027-10-31", kpi: { name: "AI月商", target: 100000, unit: "円", source: "ai_revenue" } },
      { title: "AI事業月商30万円", due: "2028-12-31", kpi: { name: "AI月商", target: 300000, unit: "円", source: "ai_revenue" } },
      { title: "AI事業月商40万円", due: "2030-06-30", priority: 1, kpi: { name: "AI月商", target: 400000, unit: "円", source: "ai_revenue" } },
    ],
  },
  {
    code: "C",
    title: "集客・個人ブランド",
    category: "集客",
    actions: [
      { title: "専門家としてのポジショニング", due: "2027-01-31", priority: 1 },
      { title: "Threads発信継続", due: "2027-06-30", kpi: { name: "週あたり投稿数", target: 5, unit: "本/週" } },
      { title: "Instagram発信継続", due: "2027-06-30", kpi: { name: "週あたり投稿数", target: 3, unit: "本/週" } },
      { title: "予約導線完成", due: "2027-04-30", priority: 1 },
      { title: "SNS流入の計測", due: "2027-06-30" },
      { title: "月間問い合わせ数の目標達成", due: "2027-12-31", kpi: { name: "問い合わせ数／月", target: 20, unit: "件", source: "inquiries" } },
      { title: "顧客紹介の仕組み構築", due: "2028-03-31" },
      { title: "安定した新規顧客獲得", due: "2028-12-31", kpi: { name: "新患数／月", target: 10, unit: "人", source: "new_patients" } },
    ],
  },
  {
    code: "D",
    title: "お金・財務",
    category: "財務",
    actions: [
      { title: "家計生活費の把握", due: "2026-12-31", priority: 1 },
      { title: "独立初期費用の試算", due: "2027-01-31", priority: 1 },
      { title: "生活防衛資金の確保", due: "2028-03-31", priority: 1, kpi: { name: "生活防衛資金", target: 6, unit: "か月", source: "emergency_fund_months" } },
      { title: "月次収支管理", due: "2027-01-31" },
      { title: "事業経費率の管理", due: "2027-12-31", kpi: { name: "事業経費率", target: 25, unit: "%", source: "expense_ratio", direction: "lower" } },
      { title: "税金・社会保険の資金計画", due: "2027-12-31", description: "独立後の国民健康保険・国民年金・所得税・住民税・（必要に応じて）消費税の資金計画。税理士に確認する" },
      { title: "月間事業利益80万円", due: "2030-06-30", kpi: { name: "月間事業利益", target: 800000, unit: "円", source: "business_profit" } },
      { title: "年間事業所得1,200万円", due: "2030-12-31", priority: 1, kpi: { name: "年間事業所得（直近12か月）", target: 12000000, unit: "円", source: "annual_business_income" } },
    ],
  },
  {
    code: "E",
    title: "AI・自動化",
    category: "自動化",
    actions: [
      { title: "予約フォーム自動化", due: "2027-03-31" },
      { title: "予約確定・通知管理", due: "2027-04-30" },
      { title: "顧客管理システム", due: "2027-06-30" },
      { title: "SNS制作の効率化", due: "2027-06-30" },
      { title: "売上集計の自動化", due: "2027-03-31" },
      { title: "タスク管理の自動化", due: "2027-02-28" },
      { title: "AI経営分析の導入", due: "2027-09-30" },
      { title: "事務作業時間50%削減", due: "2028-03-31", kpi: { name: "事務作業時間の削減率", target: 50, unit: "%" } },
    ],
  },
  {
    code: "F",
    title: "独立準備",
    category: "独立準備",
    actions: [
      { title: "勤務先規定の確認", due: "2026-12-31", priority: 1, description: "就業規則の副業・競業避止・退職手続きの規定を確認する" },
      { title: "開業形態の検討", due: "2027-03-31", description: "個人事業主か法人か、青色申告、屋号。税理士に相談する" },
      { title: "保健所・法的要件の確認", due: "2027-03-31", priority: 1, description: "施術所開設届・構造設備基準・広告規制を保健所に確認する" },
      { title: "事業計画書完成", due: "2027-06-30" },
      { title: "必要設備の準備", due: "2027-12-31" },
      { title: "顧客獲得の検証", due: "2027-10-31" },
      { title: "独立条件を6か月継続達成", due: "2028-03-31", priority: 1, kpi: { name: "基準利益の連続達成月数", target: 6, unit: "か月", source: "profit_months" } },
      { title: "退職・独立判断", due: "2028-04-30", priority: 1, description: "条件を満たしても自動で退職を決めない。家族と話し合い、自分で判断する" },
    ],
  },
  {
    code: "G",
    title: "家族・自由",
    category: "家族",
    actions: [
      { title: "理想の週間スケジュール作成", due: "2026-12-31" },
      { title: "家族時間の目標設定", due: "2026-12-31", kpi: { name: "家族時間", target: 20, unit: "時間/週", source: "family_hours" } },
      { title: "週4日勤務体制の設計", due: "2027-12-31" },
      { title: "休日の確保", due: "2028-06-30" },
      { title: "仕事の時間外対応を削減", due: "2028-06-30" },
      { title: "旅行・趣味予算の確保", due: "2028-12-31" },
      { title: "家族との時間を毎月振り返る", due: "2027-12-31" },
      { title: "自分で働き方を決められる状態", due: "2030-12-31", priority: 1 },
    ],
  },
  {
    code: "H",
    title: "健康・自己成長",
    category: "健康",
    actions: [
      { title: "朝の運動習慣", due: "2027-01-31", kpi: { name: "運動日数", target: 4, unit: "日/週" } },
      { title: "筋力・体力維持", due: "2027-06-30" },
      { title: "睡眠時間の確保", due: "2027-01-31", kpi: { name: "平均睡眠時間", target: 7, unit: "時間" } },
      { title: "鍼灸技術の研鑽", due: "2027-12-31" },
      { title: "AI開発スキル向上", due: "2027-06-30" },
      { title: "経営・財務知識の習得", due: "2027-12-31" },
      { title: "月次自己レビュー", due: "2026-12-31" },
      { title: "長期的に働ける健康状態", due: "2030-12-31" },
    ],
  },
];

export const AREA_TITLES: Record<AreaCode, string> = Object.fromEntries(TEMPLATE_GOALS.map((g) => [g.code, g.title])) as Record<AreaCode, string>;

export interface TemplateMilestone {
  title: string;
  target_date: string;
  metric: string;
  target_amount: number | null;
  area_code: AreaCode | null;
  description: string;
}

export const TEMPLATE_MILESTONES: TemplateMilestone[] = [
  { title: "独立事業の準備基盤完成", target_date: "2027-01-31", metric: "none", target_amount: null, area_code: "F", description: "コンセプト・開業条件・家計・開発環境がそろう" },
  { title: "最初の有料顧客獲得を検証", target_date: "2027-04-30", metric: "ai_cumulative_contracts", target_amount: null, area_code: "B", description: "施術・AIそれぞれで「お金を払ってもらえる」ことを確認する" },
  { title: "施術・AI両事業の継続収益を確立", target_date: "2027-07-31", metric: "none", target_amount: null, area_code: null, description: "継続患者とAI月額契約が毎月の収益になっている" },
  { title: "副業収益の安定化", target_date: "2027-10-31", metric: "business_profit", target_amount: 300000, area_code: "D", description: "月間事業利益の目安" },
  { title: "独立判断", target_date: "2028-04-01", metric: "none", target_amount: null, area_code: "F", description: "独立条件の判定結果を見て、家族と相談して自分で判断する（自動では決めない）" },
  { title: "年収1,000万円相当を目指す", target_date: "2029-10-31", metric: "annual_business_income", target_amount: 10000000, area_code: "D", description: "直近12か月の事業所得" },
  { title: "年間事業所得1,200万円を目指す", target_date: "2030-12-31", metric: "annual_business_income", target_amount: 12000000, area_code: "D", description: "最終目標" },
];

export interface CriterionDef {
  code: CriterionCode;
  title: string;
  description: string;
  threshold: number | null;
  threshold2: number | null;
  thresholdLabel?: string;
  threshold2Label?: string;
}

export const CRITERIA_DEFS: CriterionDef[] = [
  { code: "profit", title: "直近6か月の事業利益が基準以上", description: "完了した直近6か月すべてで、事業利益（売上−事業経費）が基準以上", threshold: 300000, threshold2: null, thresholdLabel: "月間事業利益の基準（円）" },
  { code: "emergency_fund", title: "生活防衛資金が生活費の6〜12か月分以上", description: "最新の生活防衛資金 ÷ 月の生活費（基準の月数は設定画面）", threshold: null, threshold2: null },
  { code: "clinic_retention", title: "施術顧客の継続状況が基準以上", description: "継続患者数と、直近3か月の平均継続率", threshold: 40, threshold2: 0.75, thresholdLabel: "継続患者数の基準（人）", threshold2Label: "月次継続率の基準（0〜1）" },
  { code: "ai_stability", title: "AI事業の継続契約が安定", description: "継続契約数と、直近3か月の平均解約率", threshold: 3, threshold2: 0.1, thresholdLabel: "継続契約数の基準（社）", threshold2Label: "月次解約率の上限（0〜1）" },
  { code: "preparation", title: "開業・法務・税務準備が完了", description: "マンダラ F1〜F5・D6 の達成と、専門家への確認済みチェック", threshold: null, threshold2: null },
  { code: "work_hours", title: "独立後の労働時間が上限内", description: "主シナリオの試算で、独立後6か月の週あたり事業時間（上限は設定画面）", threshold: null, threshold2: null },
  { code: "household", title: "家族生活に必要な手取りを確保できる見込み", description: "直近3か月の事業の税引後手取り（概算）が生活費以上。実績が足りない場合は試算で確認", threshold: null, threshold2: null },
];
