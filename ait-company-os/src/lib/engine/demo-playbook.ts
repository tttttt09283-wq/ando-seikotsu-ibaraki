import type { Intent, Priority } from "@/lib/types";
export { APPROVAL_CATEGORY_LABEL } from "@/config/approvals";
import type { PlannedTask } from "./executor";

/**
 * DEMO MODE 用の CHAD の判断ルールと成果物テンプレート。
 * ここで生成される内容はすべて「デモデータ」であり、実際の調査結果ではない。
 */

export const DEMO_DELIVERABLE_HEADER =
  "【デモ成果物】DEMO MODEのテンプレート出力です。実際の調査・分析結果ではありません。";

type TaskTemplate = Omit<PlannedTask, "key" | "dependsOn"> & {
  key: string;
  dependsOn?: string[];
  /** 成果物本文（revision = 修正回数） */
  body: (revision: number) => string;
  /** demoRevision の場合、最初のレビューで出す修正依頼 */
  revisionComment?: string;
  approveComment: string;
};

export type IntentPlaybook = {
  intent: Intent;
  label: string;
  priority: Priority;
  priorityReason: string;
  understanding: string;
  concern?: string;
  project?: { title: string; objective: string; executiveId: string };
  tasks: TaskTemplate[];
};

// ---------------------------------------------------------------------------
// 意図の判定
// ---------------------------------------------------------------------------

const INTENT_RULES: { intent: Intent; pattern: RegExp }[] = [
  { intent: "status_report", pattern: /(報告|どうなって|進捗(を|は|どう)|今の状況|現状を教えて)/ },
  { intent: "staffing", pattern: /(増員|採用|社員を増|人を増|配置転換|人手|体制)/ },
  { intent: "automation", pattern: /(業務改善|自動化|効率化|AI.{0,6}サービス|RPA)/i },
  { intent: "sns", pattern: /(SNS|インスタ|Instagram|TikTok|YouTube|投稿|フォロワー|集客)/i },
  { intent: "sales", pattern: /(営業|顧客|販路|提案|商談|リード)/ },
  { intent: "product", pattern: /(商品|サービス|新しい|メニュー|プラン)/ },
  { intent: "finance", pattern: /(売上|利益|コスト|予算|価格|財務|収支|お金)/ },
  { intent: "mission", pattern: /(MISSION|ミッション|会社を動かして|最初の1円|最初の一円|進めて|動かして)/i },
];

export function classifyIntent(text: string): Intent {
  const normalized = text.normalize("NFKC");
  // 「MISSION 001を進めて」のように明示された場合は最優先
  if (/(MISSION|ミッション)\s*0*1/i.test(normalized)) return "mission";
  for (const rule of INTENT_RULES) {
    if (rule.pattern.test(normalized)) return rule.intent;
  }
  return "general";
}

/** CHADの反対意見。指示そのものに無駄がある場合に述べる */
export function extraConcern(text: string): string | undefined {
  if (/会議|ミーティング/.test(text)) {
    return "会議は増やしません。判断が必要なものは承認画面とCHAD REPORTに集約し、CEOの時間を守ります。";
  }
  if (/全部|すべて|全て/.test(text)) {
    return "全部を同時に進めると成果が薄まります。売上に最も近いものから順番に着手します。";
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// 成果物テンプレート
// ---------------------------------------------------------------------------

const lines = (...xs: string[]) => xs.join("\n");

const marketResearch: TaskTemplate = {
  key: "market",
  title: "地域の中小事業者のAI・SNS課題調査",
  description: "最初の顧客候補となる業種を3つに絞り、困りごとと予算感を整理する。",
  department: "sales",
  assigneeId: "takahashi",
  milestone: "target",
  approveComment: "対象業種が絞れていて、次工程（商品設計）に使える。承認します。",
  body: () =>
    lines(
      "■ 結論：最初に狙うのは「従業員5〜20名の店舗型ビジネス」",
      "",
      "■ 候補業種と困りごと（仮説）",
      "1. 整骨院・美容サロン：予約対応・LINE返信・口コミ依頼が手作業",
      "2. 飲食店：SNS投稿が続かない、メニュー更新が属人化",
      "3. 工務店・リフォーム：問い合わせ対応と見積作成に時間がかかる",
      "",
      "■ 共通点",
      "・オーナーが現場に立っており、事務・発信の時間がない",
      "・月1〜5万円なら「人を雇うより安い」と判断しやすい",
      "",
      "■ 検証方法",
      "・各業種5社ずつ、公開情報（SNS更新頻度・口コミ返信率）を確認する",
      "・CEO承認後、3社にヒアリングを依頼する",
    ),
};

const offerDesign: TaskTemplate = {
  key: "offer",
  title: "最初に売る商品「AI業務改善スターター」の設計",
  description: "調査結果から、知らない顧客でも買いやすい入口商品を1つ設計する。",
  department: "ai",
  assigneeId: "kobayashi",
  dependsOn: ["market"],
  milestone: "offer",
  demoRevision: true,
  revisionComment:
    "価格の根拠が弱い。顧客が「人を雇うより安い」と分かる比較を追加してください。",
  approveComment: "比較が入り、買う理由が明確になった。承認します。",
  body: (revision) =>
    lines(
      "■ 商品名：AI業務改善スターター（初回限定）",
      "",
      "■ 内容",
      "・業務ヒアリング30分（オンライン）",
      "・「AIで減らせる作業」診断シート",
      "・すぐ使える自動化を1つ導入（例：問い合わせ自動返信、SNS投稿文の下書き）",
      "",
      "■ 提供価格（案）：初回 29,800円",
      "",
      "■ 売り方",
      "・成果が出なければ2回目の改善を無料で行う（リスク反転）",
      "・導入後、月額9,800円の運用サポートへつなげる",
      ...(revision > 0
        ? [
            "",
            "■【修正】価格の根拠（レビュー指摘への対応）",
            "・パート事務員を週5時間雇う場合：月 約2万円＋採用・教育の手間",
            "・本商品：初回29,800円で、月5時間以上の作業削減を目標",
            "→ 2か月目以降は月額9,800円で「人を雇うより安い」状態を作る",
          ]
        : []),
    ),
};

const pricing: TaskTemplate = {
  key: "pricing",
  title: "価格設計と利益シミュレーション",
  description: "月10万円の売上目標に対し、必要な販売数と利益を試算する。",
  department: "admin",
  assigneeId: "watanabe",
  dependsOn: ["offer"],
  approveComment: "目標までの逆算が明確。AIコストも入っていて良い。承認します。",
  body: () =>
    lines(
      "■ 月10万円の達成パターン（試算）",
      "A. スターター 29,800円 × 3件 ＝ 89,400円 ＋ 月額 9,800円 × 2件 ＝ 109,000円",
      "B. スターター 29,800円 × 4件 ＝ 119,200円",
      "",
      "■ 原価の想定",
      "・AI利用料：1件あたり 約300〜800円",
      "・CEOの作業時間：1件あたり 約2時間（ヒアリング・最終確認）",
      "",
      "■ 判断",
      "・最初の1件は値引きせず、代わりに「成果保証（無料の再改善）」で不安を消す",
      "・3件目までに作業手順を型にして、CEOの時間を1件1時間以下にする",
    ),
};

const snsFunnel: TaskTemplate = {
  key: "sns-funnel",
  title: "SNS集客導線の設計（投稿案3本）",
  description: "知らない顧客がA.I.T companyを知り、問い合わせるまでの導線を作る。",
  department: "sales",
  assigneeId: "nakamura",
  dependsOn: ["market"],
  approveComment: "投稿の切り口が具体的。公開前にCEO確認が必要な点も明記されている。承認します。",
  body: () =>
    lines(
      "■ 導線：投稿 → プロフィール → 無料診断フォーム → オンライン面談",
      "",
      "■ 投稿案（下書き・未公開）",
      "1.「整骨院の予約LINE、AIに返信させたら1日40分減った話」",
      "2.「飲食店オーナー向け：SNS投稿をAIで10分にする手順」",
      "3.「人を雇う前に試してほしい、月1万円以下の業務改善」",
      "",
      "■ 注意",
      "・公開投稿はCEO承認が必須（このTaskでは下書きまで）",
      "・実績の数字は、実際の導入後に差し替える",
    ),
};

const prospectList: TaskTemplate = {
  key: "prospects",
  title: "見込み顧客リストと提案文の作成",
  description: "調査した業種から提案先候補を整理し、最初の提案文を作る。",
  department: "sales",
  assigneeId: "takahashi",
  dependsOn: ["offer", "pricing"],
  milestone: "pipeline",
  approveComment: "提案文が押し売りになっておらず、相手の得が先に書かれている。承認します。",
  body: () =>
    lines(
      "■ 提案先候補（デモ用の架空リスト）",
      "・業種A：整骨院 3件 / 業種B：美容サロン 2件",
      "※ 実在の事業者情報ではありません",
      "",
      "■ 提案文（下書き）",
      "件名：予約・問い合わせ対応の時間を、AIで減らしませんか",
      "本文：",
      "はじめまして、A.I.T companyです。",
      "LINEや電話の問い合わせ対応にかかっている時間を、AIで減らすお手伝いをしています。",
      "まずは30分の無料診断で「どの作業が減らせるか」だけお伝えします。",
      "売り込みはしませんので、ご興味があればご返信ください。",
    ),
};

const firstContact: TaskTemplate = {
  key: "first-contact",
  title: "最初の提案の送信（CEO承認後に実行）",
  description: "レビュー済みの提案文を候補先へ送る。外部送信のためCEO承認が必須。",
  department: "sales",
  assigneeId: "takahashi",
  dependsOn: ["prospects"],
  milestone: "first-contact",
  requiresApproval: "customer_proposal",
  approveComment: "送信内容・宛先ともに問題なし。CEO承認へ回します。",
  body: () =>
    lines(
      "■ 送信予定の内容",
      "・宛先：見込み顧客リストの5件（デモ用の架空リスト）",
      "・手段：問い合わせフォーム / メール",
      "・本文：「見込み顧客リストと提案文の作成」でレビュー済みの文面",
      "",
      "■ 送信条件",
      "・CEO承認後にのみ実行する",
      "・DEMO MODEでは実際の送信は行わない",
    ),
};

// ---- 商品 ----
const needs: TaskTemplate = {
  key: "needs",
  title: "顧客ニーズの洗い出し",
  description: "商品を作る前に、誰がどんな理由でお金を払うのかを整理する。",
  department: "sales",
  assigneeId: "takahashi",
  approveComment: "「お金を払う理由」まで踏み込めている。承認します。",
  body: () =>
    lines(
      "■ お金を払う理由（仮説）",
      "1. 時間がない：オーナーが現場に出ていて事務が回らない",
      "2. 発信が続かない：SNSの重要性は分かるが手が止まる",
      "3. 人が採れない：採用より安く、すぐ始められる手段がほしい",
      "",
      "■ 示唆",
      "・「AI」ではなく「作業が減る」「お客さんが増える」で語る",
    ),
};
const productIdeas: TaskTemplate = {
  key: "ideas",
  title: "商品案3つの作成",
  description: "ニーズに合わせて、すぐ売れる商品案を3つ作る。",
  department: "ai",
  assigneeId: "kobayashi",
  dependsOn: ["needs"],
  approveComment: "3案とも導入の手間が小さい。承認します。",
  body: () =>
    lines(
      "1. AI問い合わせ一次対応セット（初期 29,800円 / 月 9,800円）",
      "2. SNS投稿まるごと下書き便（月 14,800円・月12本）",
      "3. 口コミ返信・依頼の自動化（初期 19,800円）",
      "",
      "■ 推奨：1から始める（効果が数字で見えやすく、継続課金につながる）",
    ),
};
const profitability: TaskTemplate = {
  key: "profit",
  title: "商品案の収益性評価",
  description: "各案の利益率・CEOの作業時間・継続性を比較する。",
  department: "admin",
  assigneeId: "watanabe",
  dependsOn: ["ideas"],
  approveComment: "比較軸が明確で判断しやすい。承認します。",
  body: () =>
    lines(
      "| 案 | 粗利率 | CEO作業時間 | 継続性 |",
      "| 1 | 約85% | 2h/件 | 高 |",
      "| 2 | 約70% | 1h/月 | 中 |",
      "| 3 | 約90% | 1h/件 | 低 |",
      "",
      "■ 結論：1を主力、2を追加提案にする",
    ),
};

// ---- 営業 ----
const salesTarget: TaskTemplate = {
  key: "target",
  title: "ターゲットと営業ルートの決定",
  description: "知らない顧客に最短で届く営業ルートを決める。",
  department: "sales",
  assigneeId: "takahashi",
  milestone: "target",
  approveComment: "ルートの優先順位に根拠がある。承認します。",
  body: () =>
    lines(
      "■ 優先する営業ルート",
      "1. 問い合わせフォームからの個別提案（即効性・高）",
      "2. 地域のビジネス交流会・紹介（信頼性・高）",
      "3. SNS経由の無料診断（中長期）",
      "",
      "■ 最初の2週間：1を中心に、1日3件の提案を目標にする",
    ),
};
const salesChannel: TaskTemplate = {
  key: "channel",
  title: "無料診断フォームと問い合わせ導線の設計",
  description: "興味を持った見込み顧客が迷わず申し込める導線を作る。",
  department: "sales",
  assigneeId: "nakamura",
  dependsOn: ["target"],
  approveComment: "入力項目が少なく、申し込みやすい。承認します。",
  body: () =>
    lines(
      "■ フォーム項目（最小限）",
      "・業種 / 困っている作業 / 連絡先",
      "",
      "■ 申し込み後の流れ",
      "自動返信 → 日程調整リンク → 30分オンライン診断 → 提案",
    ),
};
const salesKpi: TaskTemplate = {
  key: "kpi",
  title: "営業KPIの設計",
  description: "月10万円から逆算して、毎日見る数字を決める。",
  department: "admin",
  assigneeId: "watanabe",
  dependsOn: ["target"],
  approveComment: "毎日見る数字が3つに絞られていて良い。承認します。",
  body: () =>
    lines(
      "■ 逆算（成約単価 29,800円 / 月10万円）",
      "成約4件 ← 面談12件（成約率33%） ← 返信40件 ← 提案400件（返信率10%）",
      "",
      "■ 毎日見る数字：提案数 / 返信数 / 面談数",
    ),
};

// ---- SNS ----
const snsCompetitors: TaskTemplate = {
  key: "competitors",
  title: "同業アカウントの分析",
  description: "AI・業務改善を発信しているアカウントの伸びている投稿を分析する。",
  department: "sales",
  assigneeId: "nakamura",
  approveComment: "伸びる投稿の型が整理されている。承認します。",
  body: () =>
    lines(
      "■ 伸びている投稿の型",
      "1. ビフォーアフター（作業時間 60分 → 10分）",
      "2. 業種名入りのハウツー（「美容室のための〜」）",
      "3. 失敗談（「AIに任せて失敗したこと」）",
      "",
      "■ 伸びない型：ツール紹介だけの投稿",
    ),
};
const snsAudience: TaskTemplate = {
  key: "audience",
  title: "見込み顧客のSNS利用状況の分析",
  description: "店舗オーナーがどの時間帯・媒体で情報収集しているかを整理する。",
  department: "sales",
  assigneeId: "takahashi",
  approveComment: "投稿時間の根拠が明確。承認します。",
  body: () =>
    lines(
      "■ 仮説",
      "・Instagram：開店前（8〜9時）と閉店後（21〜23時）",
      "・X：昼休み（12〜13時）",
      "",
      "■ 示唆：平日21時台に、業種名入りの投稿を優先する",
    ),
};
const snsPlan: TaskTemplate = {
  key: "plan",
  title: "30日間の投稿計画",
  description: "分析結果をもとに、問い合わせにつながる投稿計画を作る。",
  department: "sales",
  assigneeId: "nakamura",
  dependsOn: ["competitors", "audience"],
  approveComment: "問い合わせ導線まで設計されている。承認します。",
  body: () =>
    lines(
      "■ 週3本 × 4週 ＝ 12本",
      "・月：ビフォーアフター / 水：業種別ハウツー / 金：失敗談・裏側",
      "",
      "■ すべての投稿の最後に「無料診断」への導線を入れる",
    ),
};
const snsFirstPost: TaskTemplate = {
  key: "first-post",
  title: "初回投稿の公開（CEO承認後に実行）",
  description: "投稿計画の1本目を公開する。公開投稿のためCEO承認が必須。",
  department: "sales",
  assigneeId: "nakamura",
  dependsOn: ["plan"],
  requiresApproval: "sns_post",
  approveComment: "表現・誤解のおそれを確認済み。CEO承認へ回します。",
  body: () =>
    lines(
      "■ 公開予定の投稿（下書き）",
      "「整骨院の予約LINE、AIに一次返信させたら1日40分減りました。",
      " やったことは3つだけ。①よくある質問を10個書き出す ②…」",
      "",
      "■ 公開先：Instagram（DEMO MODEでは実際には投稿しない）",
    ),
};

// ---- AI業務改善 ----
const automationMenu: TaskTemplate = {
  key: "menu",
  title: "AI業務改善サービスのメニュー設計",
  description: "店舗型ビジネス向けに、導入しやすい改善メニューを設計する。",
  department: "ai",
  assigneeId: "kobayashi",
  demoRevision: true,
  revisionComment: "メニューが多すぎて選べない。最初は3つに絞ってください。",
  approveComment: "3つに絞られ、選びやすくなった。承認します。",
  body: (revision) =>
    revision > 0
      ? lines(
          "■【修正版】メニューを3つに絞りました",
          "1. 問い合わせ自動一次返信",
          "2. SNS投稿の下書き自動作成",
          "3. 口コミ返信の下書き",
          "",
          "■ 共通：導入1週間、効果測定レポート付き",
        )
      : lines(
          "■ メニュー案",
          "問い合わせ自動返信 / SNS投稿下書き / 口コミ返信 / 予約リマインド /",
          "請求書作成補助 / 日報要約 / 議事録作成 / 在庫通知",
        ),
};
const automationRoi: TaskTemplate = {
  key: "roi",
  title: "導入効果（ROI）の試算",
  description: "顧客が払う金額に対して、どれだけ時間とお金が浮くかを示す。",
  department: "admin",
  assigneeId: "watanabe",
  dependsOn: ["menu"],
  approveComment: "顧客目線の数字になっている。承認します。",
  body: () =>
    lines(
      "■ 例：問い合わせ自動一次返信",
      "・削減時間：1日30分 × 25日 ＝ 月12.5時間",
      "・時給1,200円換算：月 15,000円分",
      "・サービス料：月 9,800円 → 顧客の実質メリット 月 約5,200円",
    ),
};
const automationPitch: TaskTemplate = {
  key: "pitch",
  title: "提案資料の骨子作成",
  description: "メニューとROIをもとに、初回面談で使う提案資料の骨子を作る。",
  department: "sales",
  assigneeId: "takahashi",
  dependsOn: ["menu", "roi"],
  approveComment: "相手の課題から始まる構成になっている。承認します。",
  body: () =>
    lines(
      "1. 今、こんな作業に時間を取られていませんか",
      "2. AIで減らせる作業・減らせない作業",
      "3. 3つのメニューと導入効果",
      "4. 料金と成果保証",
      "5. 導入までの流れ（最短1週間）",
    ),
};

// ---- 財務 ----
const financeStatus: TaskTemplate = {
  key: "status",
  title: "現在の収支とAIコストの整理",
  description: "売上・費用・AI利用料を整理し、現状を把握する。",
  department: "admin",
  assigneeId: "watanabe",
  approveComment: "デモと本番の数字が分けて整理されている。承認します。",
  body: () =>
    lines(
      "■ 本番実績：売上 0円（まだ最初の1円は発生していない）",
      "■ AIコスト：アプリの「AIコスト」に記録された実績を参照",
      "",
      "■ 示唆：売上がない段階では、AI利用は月の予算上限内に抑える",
    ),
};
const financeBackcast: TaskTemplate = {
  key: "backcast",
  title: "月10万円達成までの逆算",
  description: "目標達成に必要な販売数・期限・コスト上限を決める。",
  department: "admin",
  assigneeId: "watanabe",
  dependsOn: ["status"],
  approveComment: "期限と数字がはっきりしている。承認します。",
  body: () =>
    lines(
      "■ 3か月計画",
      "・1か月目：最初の1円（スターター1件）",
      "・2か月目：月 5万円（スターター2件＋月額1件）",
      "・3か月目：月 10万円（スターター3件＋月額2件）",
      "",
      "■ AIコスト上限：売上の10%以内",
    ),
};

// ---- 汎用 ----
const generalResearch: TaskTemplate = {
  key: "research",
  title: "指示内容の調査と論点整理",
  description: "CEOの指示について、売上・利益・時間削減の観点で論点を整理する。",
  department: "sales",
  assigneeId: "takahashi",
  approveComment: "論点が整理されている。承認します。",
  body: () =>
    lines(
      "■ 論点",
      "1. 売上につながるか（MISSION 001への貢献度）",
      "2. 費用と時間はどれくらいかかるか",
      "3. 今すぐやるべきか、後回しでよいか",
      "",
      "■ 次の一手：CHADが優先度を判断し、必要なら具体的なProjectに切り出す",
    ),
};

// ---------------------------------------------------------------------------
// 意図ごとのプレイブック
// ---------------------------------------------------------------------------

export const PLAYBOOKS: Record<Exclude<Intent, "status_report" | "staffing">, IntentPlaybook> = {
  mission: {
    intent: "mission",
    label: "MISSION 001の推進",
    priority: "高",
    priorityReason: "MISSION 001そのもの。最初の1円に直結するため最優先。",
    understanding:
      "MISSION 001「知らない顧客から最初の1円を生み出す」を前に進める指示と判断しました。",
    project: {
      title: "MISSION 001：最初の1円を生む販売の仕組みづくり",
      objective: "売る商品・売る相手・届け方を決め、CEO承認のうえ最初の提案を送れる状態にする。",
      executiveId: "kamiya",
    },
    tasks: [marketResearch, offerDesign, pricing, snsFunnel, prospectList, firstContact],
  },
  product: {
    intent: "product",
    label: "新商品の企画",
    priority: "中",
    priorityReason: "売上の源泉になるが、販売ルートとセットで考える必要がある。",
    understanding: "売れる新しい商品・サービスを考える指示と判断しました。",
    concern:
      "売る相手が決まる前に商品を増やすのは非効率です。今回は「誰が・なぜお金を払うか」を先に固めてから商品案を絞ります。",
    project: {
      title: "新商品の企画：お金を払う理由から考える",
      objective: "顧客ニーズから逆算し、すぐ販売できる商品案を1つに絞る。",
      executiveId: "shiraishi",
    },
    tasks: [needs, productIdeas, profitability],
  },
  sales: {
    intent: "sales",
    label: "営業戦略の立案",
    priority: "高",
    priorityReason: "知らない顧客に届く仕組みがMISSION 001の最大のボトルネック。",
    understanding: "知らない顧客から問い合わせ・成約を得るための営業戦略を立てる指示と判断しました。",
    project: {
      title: "営業戦略：知らない顧客に最短で届くルートづくり",
      objective: "営業ルート・申し込み導線・毎日見る数字を決める。",
      executiveId: "kamiya",
    },
    tasks: [salesTarget, salesChannel, salesKpi],
  },
  sns: {
    intent: "sns",
    label: "SNS集客の分析",
    priority: "中",
    priorityReason: "中長期の集客資産になるが、即効性は直接提案より低い。",
    understanding: "SNSで見込み顧客を集める方法を分析する指示と判断しました。",
    concern:
      "SNSは成果が出るまで時間がかかります。最初の1円が目的なら、SNS単体ではなく直接提案と組み合わせることを推奨します。",
    project: {
      title: "SNS集客：問い合わせにつながる発信設計",
      objective: "伸びる投稿の型と投稿計画を作り、初回投稿をCEO承認のうえ公開できる状態にする。",
      executiveId: "kamiya",
    },
    tasks: [snsCompetitors, snsAudience, snsPlan, snsFirstPost],
  },
  automation: {
    intent: "automation",
    label: "AI業務改善サービスの開発",
    priority: "高",
    priorityReason: "A.I.T companyの強みを活かせる主力商品候補。",
    understanding: "店舗型ビジネス向けのAI業務改善サービスを形にする指示と判断しました。",
    project: {
      title: "AI業務改善サービス：売れるメニューと提案資料",
      objective: "メニューを3つに絞り、導入効果と提案資料まで用意する。",
      executiveId: "shiraishi",
    },
    tasks: [automationMenu, automationRoi, automationPitch],
  },
  finance: {
    intent: "finance",
    label: "財務・収支の確認",
    priority: "中",
    priorityReason: "売上ゼロの段階ではコスト管理が重要。ただし売上づくりが優先。",
    understanding: "売上・利益・コストを確認し、目標までの道筋を整理する指示と判断しました。",
    project: {
      title: "財務：月10万円までの逆算とコスト上限",
      objective: "現状の収支を整理し、3か月で月10万円に到達する計画を作る。",
      executiveId: "kuroda",
    },
    tasks: [financeStatus, financeBackcast],
  },
  general: {
    intent: "general",
    label: "その他の指示",
    priority: "低",
    priorityReason: "MISSION 001との関係がまだ不明確なため、まず論点整理から。",
    understanding: "指示の目的を売上・利益・時間削減の観点で整理するところから始めます。",
    project: {
      title: "CEO指示の論点整理",
      objective: "指示の目的と、MISSION 001への貢献度を明確にする。",
      executiveId: "kamiya",
    },
    tasks: [generalResearch],
  },
};

export function findTemplate(intent: Intent, key: string): TaskTemplate | undefined {
  if (intent === "status_report" || intent === "staffing") return undefined;
  return PLAYBOOKS[intent].tasks.find((t) => t.key === key);
}

export const INTENT_LABEL: Record<Intent, string> = {
  mission: "MISSION 001の推進",
  product: "新商品の企画",
  sales: "営業戦略の立案",
  sns: "SNS集客の分析",
  automation: "AI業務改善サービスの開発",
  finance: "財務・収支の確認",
  staffing: "組織・人員配置の検討",
  status_report: "状況報告",
  general: "その他の指示",
};
