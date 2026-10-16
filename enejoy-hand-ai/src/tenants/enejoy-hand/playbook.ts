import type { IntentPlaybook, Playbook, TaskTemplate } from "@/lib/tenant-types";

/**
 * Enejoy Hand AI部門 司令塔の判断ルールと成果物テンプレート（DEMO MODE）。
 * ここで生成される内容はすべて「デモデータ」であり、実際の調査・分析結果ではない。
 * 数字はすべて架空の例で、実際のスタッフ・患者・経営数値は使っていない。
 */

const lines = (...xs: string[]) => xs.join("\n");

// ---------------------------------------------------------------------------
// 意図の判定
// ---------------------------------------------------------------------------

const RULES: { intent: string; pattern: RegExp }[] = [
  { intent: "status_report", pattern: /(報告して|報告を|進捗(を|は|どう)|今の状況|現状を教えて|どうなって)/ },
  { intent: "staffing", pattern: /(増員|AI社員を増|人を増|配置転換|体制を見直|人手が足りない)/ },
  { intent: "revenue_plan", pattern: /(3億|３億|三億|300,?000,?000|売上目標|達成までの計画|売上計画)/ },
  { intent: "grade", pattern: /(クラス|等級|キャリア(パス|アップ)|昇格|昇給|グレード)/ },
  { intent: "evaluation", pattern: /(評価制度|評価基準|人事評価|評価シート|スタッフの評価|評価を)/ },
  { intent: "succession", pattern: /(後継者|幹部候補|院長候補|リーダー育成|育成計画)/ },
  { intent: "sns", pattern: /(SNS|インスタ|Instagram|TikTok|YouTube|投稿|発信)/i },
  { intent: "marketing", pattern: /(集客|新規|患者を増|お客様を増|来院|口コミ|広告|チラシ|キャンペーン|LINE)/i },
  { intent: "finance", pattern: /(お金|経理|収支|財務|入出金|経費|コスト|会計|資金)/ },
  { intent: "admin_ops", pattern: /(事務|ムダ|無駄|効率化|業務改善|書類|データ(の)?(集計|整理|管理)|集計|自動化|システム)/ },
  { intent: "product", pattern: /(商品開発|新商品|物販|法人|企業向け|企業への営業|BtoB)/i },
  { intent: "issues", pattern: /(課題|問題点|困りごと|優先順位)/ },
];

function classifyIntent(text: string): string {
  const t = text.normalize("NFKC");
  if (/(MISSION|ミッション)\s*0*1/i.test(t)) return "mission";
  if (/評価.{0,12}(クラス|等級)|(クラス|等級).{0,12}評価/.test(t) && /(確定|決め|固め)/.test(t)) return "mission";
  for (const r of RULES) if (r.pattern.test(t)) return r.intent;
  if (/(MISSION|ミッション|進めて|動かして)/i.test(t)) return "mission";
  return "general";
}

function extraConcern(text: string): string | undefined {
  if (/会議|ミーティング/.test(text)) {
    return "会議は増やしません。判断が必要なものは承認画面と報告に集約し、現場の時間を守ります。";
  }
  if (/全部|すべて|全て|一気に/.test(text)) {
    return "全部を同時に進めると現場が回りません。会社の土台（評価制度）と、お金の見える化を優先します。";
  }
  if (/今日中|すぐに確定|明日まで/.test(text)) {
    return "急ぐ気持ちは分かりますが、評価や処遇に関わるものは代表の決裁と現場への説明が必要です。案は早く出しますが、確定は手順を踏みます。";
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// MISSION 001：スタッフの評価基準とクラス（等級）を確定させる
// ---------------------------------------------------------------------------

const currentState: TaskTemplate = {
  key: "current",
  title: "現状把握：スタッフ構成と役割の整理シート",
  description: "部門・職種・資格・在籍年数・今の役割を整理する聞き取りシートを作り、評価制度の前提をそろえる。",
  teamId: "org",
  assigneeId: "fujita",
  milestone: "current",
  confidential: true,
  businessUnits: ["seikotsu", "beauty", "makizume"],
  approveComment: "聞き取り項目が評価軸と対応していて、次の工程にそのまま使える。承認します。",
  body: () =>
    lines(
      "■ 目的：評価制度を作る前に「誰が・どの部門で・何を担っているか」をそろえる",
      "",
      "■ 聞き取りシート（1人1枚・統括責任者が記入）",
      "1. 所属部門：鍼灸・整骨院／美容／巻き爪（兼務は主・副を記入）",
      "2. 職種・資格：柔道整復師／鍼灸師／あん摩マッサージ指圧師／美容系資格／無資格",
      "3. 在籍年数・前職の経験年数",
      "4. 今の役割：施術／受付・会計／カルテ入力／SNS・集客／新人指導／院の管理",
      "5. 本人が目指したい方向：技術を極める／院長・部門長／独立／未定",
      "6. 統括責任者から見た強み・課題（各1行）",
      "",
      "■ 取り扱い",
      "・このシートはスタッフの機密情報。閲覧は代表・統括責任者のみ",
      "・DEMO MODEでは架空のスタッフで記入例を作成。実データの入力は代表の承認後",
    ),
};

const evaluationAxes: TaskTemplate = {
  key: "axes",
  title: "評価軸5つと配点の案",
  description: "数字・技術・理念・育成・PC管理の5軸で、等級ごとの配点（重み）を決める。",
  teamId: "org",
  assigneeId: "fujita",
  dependsOn: ["current"],
  milestone: "axes",
  confidential: true,
  demoRevision: true,
  revisionComment:
    "「理念・姿勢（心豊笑幸）」の基準が抽象的。誰が評価しても同じ点になるよう、行動の例（できている／できていない）を入れてください。",
  approveComment: "行動例が入り、評価者によるブレが小さくなった。承認します。",
  body: (revision) =>
    lines(
      "■ 評価軸（100点満点）と等級ごとの配点",
      "　　　　　　　　　　　C1-C2　C3-C4　C5-C6",
      "① 数字（売上・指名・リピート）　15　　 30　　 35",
      "② 技術・資格　　　　　　　　　 35　　 25　　 15",
      "③ 理念・姿勢（心豊笑幸）　　　 30　　 15　　 15",
      "④ 育成・マネジメント　　　　　  0　　 20　　 30",
      "⑤ PC管理（データ入力・管理）　 20　　 10　　  5",
      "",
      "■ 考え方",
      "・入社直後は「技術」と「姿勢」で土台を作る。上位ほど「数字」と「育成」で評価する",
      "・数字は個人売上だけでなく、次回予約率・リピート率・指名数で見る（部門ごとに基準値を設定）",
      "・PC管理は、予約・会計・カルテを正確に入力できるか。データ集計が曖昧な今の課題に直結",
      ...(revision > 0
        ? [
            "",
            "■【修正】理念・姿勢（心豊笑幸）の行動例（レビュー指摘への対応）",
            "・できている：患者様の名前を呼んで迎える／終了時に次回の目的を一言で伝える／仲間の手が空いていない時に自分から動く",
            "・できていない：施術中の私語・スマホ／片付け・清掃を人任せにする／ミスを報告しない",
            "・評価は自己評価→リーダー評価→統括面談の3段階。点数の差が2点以上の項目は面談で理由を確認",
          ]
        : []),
    ),
};

const pcSkill: TaskTemplate = {
  key: "pc",
  title: "PC管理（データ入力・管理）の評価基準",
  description: "予約・会計・カルテ・集計の入力を、等級ごとに「できる」の基準で定義する。",
  teamId: "org",
  assigneeId: "yoshida",
  dependsOn: ["current"],
  approveComment: "現場でチェックできる具体的な基準になっている。承認します。",
  body: () =>
    lines(
      "■ PC管理の基準（できる／できないで判定）",
      "C1：予約の登録・変更、会計の入力をマニュアルを見て正確にできる",
      "C2：その日のカルテ入力を当日中に終える（未入力0件）",
      "C3：月末の数字（来院数・新規・リピート）を集計表で確認し、入力漏れを見つけられる",
      "C4：チームの入力漏れを週1回チェックし、修正を指導できる",
      "C5以上：部門の数字を月次でまとめ、会議資料にできる",
      "",
      "■ 測り方",
      "・カルテ未入力件数、会計の修正件数を月次で記録（データが取れる院から開始）",
      "・システムがない院は、紙の集計表の提出期限を守れたかで判定",
    ),
};

const grades: TaskTemplate = {
  key: "grades",
  title: "クラス（等級）6段階の案と昇格条件",
  description: "全社共通の6等級と、部門別（鍼灸・整骨院／美容／巻き爪）の技術基準・昇格条件をまとめる。",
  teamId: "org",
  assigneeId: "fujita",
  dependsOn: ["axes", "pc"],
  milestone: "grades",
  confidential: true,
  businessUnits: ["seikotsu", "beauty", "makizume"],
  approveComment: "部門ごとの技術基準が分かれていて、昇格の条件も明確。承認します。",
  body: () =>
    lines(
      "■ クラス（等級）案",
      "C1 研修生　　　：基本施術の補助、接遇と理念「心豊笑幸」の習得",
      "C2 スタッフ　　：担当施術を一人で実施、予約・会計・カルテを正確に入力",
      "C3 一人前　　　：指名・リピートで安定した数字、後輩の技術指導",
      "C4 リーダー　　：チームの数字に責任、育成計画の実行、院運営の補助",
      "C5 院長・部門長：院・部門の売上と人材に責任、評価者を担う",
      "C6 統括　　　　：複数の院・部門を統括、後継者育成、経営に参画",
      "",
      "■ 昇格条件（共通）",
      "・評価点70点以上を2回連続（年2回評価）＋上位等級の業務を3か月試行",
      "・C4以上への昇格は代表の決裁",
      "",
      "■ 部門別の技術基準（例）",
      "・鍼灸・整骨院：C2＝主訴の評価と施術計画を一人で立てられる／C3＝保険・自費の説明と次回提案ができる",
      "・美容：C2＝美容鍼・小顔矯正の標準メニューを一人で施術／C3＝カウンセリングから回数券の提案まで",
      "・巻き爪：C2＝標準的な矯正を一人で施術／C3＝難しい症例の判断と医療機関への紹介基準を理解",
    ),
};

const payLink: TaskTemplate = {
  key: "pay",
  title: "等級と給与レンジの連動試算",
  description: "等級ごとの給与レンジ案と、人件費が売上目標に対して無理のない範囲かを試算する。",
  teamId: "org",
  assigneeId: "ishikawa",
  dependsOn: ["grades"],
  confidential: true,
  approveComment: "人件費率の上限と昇給の原資が示されていて、判断材料として十分。承認します。",
  body: () =>
    lines(
      "■ 給与レンジ案（架空の例・月額）",
      "C1 20〜23万円／C2 23〜27万円／C3 27〜32万円／C4 32〜38万円／C5 38〜48万円／C6 48万円〜",
      "",
      "■ 試算の前提（架空）",
      "・年間売上3億円達成時の人件費率の上限：45%",
      "・昇給の原資は「前年からの売上増加分の20%」を上限にする",
      "",
      "■ 判断のポイント",
      "・制度の導入時に給与が下がる人を出さない（現給保障を1年間）",
      "・実際の給与データは機密。DEMO MODEでは使っていない。本番では代表の承認後に入力",
    ),
};

const trialPlan: TaskTemplate = {
  key: "trial",
  title: "試行評価の進め方とスケジュール",
  description: "少人数で試行評価を行い、基準のブレを直してから全員に展開する計画を立てる。",
  teamId: "org",
  assigneeId: "yoshida",
  dependsOn: ["grades"],
  milestone: "trial",
  approveComment: "試行→修正→展開の順番が現実的。承認します。",
  body: () =>
    lines(
      "■ 進め方",
      "1. 各部門から1〜2名を選び、自己評価とリーダー評価を試しに行う（2週間）",
      "2. 点数の差が大きい項目を洗い出し、基準の文言を修正（1週間）",
      "3. 代表の決裁で確定 → 全スタッフに説明会（30分）",
      "4. 初回の本評価（3か月後）",
      "",
      "■ 用意するもの",
      "・評価シート（スマホで入力できる形式）",
      "・面談の記録シート（良かった点・次の目標・必要な支援）",
      "",
      "■ 測る数字",
      "・スタッフ評価の完了率（対象者のうち評価と面談を終えた割合）",
    ),
};

const decideEvaluation: TaskTemplate = {
  key: "decide",
  title: "評価基準とクラスの確定（代表の決裁後に運用開始）",
  description: "評価軸・配点・等級・昇格条件・給与連動をまとめ、代表 村上の決裁を依頼する。",
  teamId: "org",
  assigneeId: "fujita",
  dependsOn: ["pay", "trial"],
  confidential: true,
  requiresApproval: "staff_evaluation",
  approvalMeta: {
    sensitive: false,
    expectedEffect: "評価とキャリアの道筋が明確になり、スタッフの成長意欲と定着が高まる。後継者育成の土台になる。",
    risk: "スタッフの処遇に直結する。説明が不十分なまま運用すると不満や離職につながる。確定後の変更は信頼を損なう。",
  },
  approveComment: "全体の整合性が取れている。代表の決裁に進めてよい内容です。",
  body: () =>
    lines(
      "■ 確定する内容",
      "・評価軸5つ（数字／技術・資格／理念・姿勢（心豊笑幸）／育成・マネジメント／PC管理）と等級ごとの配点",
      "・クラス6段階（C1研修生〜C6統括）と部門別の技術基準",
      "・昇格条件（70点以上を2回連続＋3か月試行、C4以上は代表の決裁）",
      "・給与レンジ案と現給保障（1年間）",
      "・運用：年2回の評価＋月1回の面談、評価データの閲覧は代表・統括責任者・担当リーダーのみ",
      "",
      "■ 決裁後の動き",
      "・試行評価を開始し、結果を見て文言を修正",
      "・全スタッフへの説明会の資料を作成",
    ),
};

// ---------------------------------------------------------------------------
// 評価制度・クラス・後継者育成
// ---------------------------------------------------------------------------

const evalHearing: TaskTemplate = {
  ...currentState,
  key: "hearing",
  milestone: undefined,
};

const evalSheet: TaskTemplate = {
  key: "sheet",
  title: "評価シートと面談の型",
  description: "自己評価・リーダー評価・面談記録を1枚で回せる評価シートを作る。",
  teamId: "org",
  assigneeId: "fujita",
  dependsOn: ["axes"],
  confidential: true,
  approveComment: "現場で回せる分量になっている。承認します。",
  body: () =>
    lines(
      "■ 評価シート（1人1枚・スマホ入力を想定）",
      "・5軸それぞれ：自己評価（1〜5）／リーダー評価（1〜5）／根拠となる行動を1行",
      "・今期の目標（数字1つ・技術1つ・行動1つ）",
      "",
      "■ 面談の型（20分）",
      "1. 良かった点を先に伝える（3分）",
      "2. 点数の差が大きい項目をすり合わせる（10分）",
      "3. 次の目標と、会社が用意する支援を決める（7分）",
    ),
};

const evalOps: TaskTemplate = {
  key: "ops",
  title: "評価の運用ルールとスケジュール",
  description: "評価の時期・評価者・記録の保管・閲覧権限を決める。",
  teamId: "org",
  assigneeId: "yoshida",
  dependsOn: ["sheet"],
  approveComment: "閲覧権限まで決まっていて安心。承認します。",
  body: () =>
    lines(
      "■ スケジュール：年2回（6月・12月）の評価＋毎月の面談",
      "■ 評価者：C1〜C3はリーダー、C4以上は統括責任者、最終確認は代表",
      "■ 記録：評価シートは会社の管理場所に保存。個人の端末に残さない",
      "■ 閲覧：本人・評価者・代表・統括責任者のみ。他のスタッフの評価は見られない",
    ),
};

const evalDecide: TaskTemplate = {
  ...decideEvaluation,
  key: "decide",
  title: "評価制度の確定（代表の決裁後に運用開始）",
  dependsOn: ["ops"],
};

const gradeBenchmarks: TaskTemplate = {
  key: "unit-skills",
  title: "部門別の技術基準（鍼灸・整骨院／美容／巻き爪）",
  description: "等級ごとに、部門別に「一人でできる施術・説明」の基準を書き出す。",
  teamId: "org",
  assigneeId: "fujita",
  dependsOn: ["grades"],
  businessUnits: ["seikotsu", "beauty", "makizume"],
  approveComment: "部門ごとの違いが反映されている。承認します。",
  body: () =>
    lines(
      "■ 鍼灸・整骨院",
      "C2：問診・検査・施術計画を一人で／C3：自費メニューと回数券の提案／C4：新人の技術チェック",
      "■ 美容",
      "C2：美容鍼・小顔矯正の標準施術／C3：カウンセリングと継続提案／C4：メニュー改善の提案",
      "■ 巻き爪",
      "C2：標準的な矯正／C3：難症例の判断と紹介基準／C4：施術品質のチェックと教育",
    ),
};

const gradeDecide: TaskTemplate = {
  ...decideEvaluation,
  key: "decide",
  title: "クラス（等級）案の確定（代表の決裁後に運用開始）",
  dependsOn: ["unit-skills", "pay"],
};

const successionReq: TaskTemplate = {
  key: "requirements",
  title: "後継者（院長・部門長候補）に求める要件",
  description: "院長・部門長に必要な力を、評価軸とつなげて定義する。",
  teamId: "org",
  assigneeId: "fujita",
  confidential: true,
  approveComment: "評価制度とつながっていて、育成の目標にできる。承認します。",
  body: () =>
    lines(
      "■ 院長・部門長（C5）に求める要件",
      "・数字：担当院・部門の売上と利益を月次で説明できる",
      "・人：C3以上のスタッフを1名以上育てた実績",
      "・理念：「心豊笑幸」を自分の言葉でスタッフに伝えられる",
      "・管理：シフト・予約・会計のデータを見て、問題に気づける",
      "",
      "■ 候補の選び方",
      "・C3以上で本人が希望する人から、統括責任者が推薦 → 代表が決定",
    ),
};

const successionRoadmap: TaskTemplate = {
  key: "roadmap",
  title: "12か月の育成ロードマップ",
  description: "候補者が12か月で院長業務を任せられる状態になる計画を作る。",
  teamId: "org",
  assigneeId: "fujita",
  dependsOn: ["requirements"],
  demoRevision: true,
  revisionComment: "今いる院長・リーダーの負担が増えすぎないか分からない。誰が何時間教えるのかを入れてください。",
  approveComment: "教える側の時間まで入り、現場で実行できる計画になった。承認します。",
  body: (revision) =>
    lines(
      "■ 0〜3か月：見て覚える（開院・閉院業務、日報、シフト作成の同席）",
      "■ 4〜6か月：一部を任せる（シフト作成、月次の数字報告、新人1名の指導）",
      "■ 7〜9か月：院長代行（院長不在日の運営、スタッフ面談の同席）",
      "■ 10〜12か月：独り立ち（院の月次目標に責任を持つ）",
      "",
      "■ 毎月の確認：統括責任者と30分の振り返り",
      ...(revision > 0
        ? [
            "",
            "■【修正】教える側の負担（レビュー指摘への対応）",
            "・現院長：月4時間（週1時間）まで。マニュアル化した業務は動画・資料で代替",
            "・統括責任者：月1回30分の振り返り",
            "・院長業務のマニュアル化（事務・データ管理担当）で、教える時間を減らす",
          ]
        : []),
    ),
};

const successionManual: TaskTemplate = {
  key: "manual",
  title: "院長業務の棚卸しとマニュアル化の計画",
  description: "院長が一人で抱えている業務を書き出し、マニュアル化の順番を決める。",
  teamId: "org",
  assigneeId: "yoshida",
  dependsOn: ["requirements"],
  approveComment: "属人化している業務が見えるようになった。承認します。",
  body: () =>
    lines(
      "■ 院長業務の棚卸し（例）",
      "毎日：開院準備、日報、会計の締め　毎週：シフト調整、在庫の発注　毎月：売上の集計、スタッフ面談",
      "",
      "■ マニュアル化の順番（頻度×引き継ぎにくさ）",
      "1. 会計の締めと日報（毎日・ミスが起きやすい）",
      "2. 売上の集計（毎月・データ集計が曖昧な課題に直結）",
      "3. シフト調整（毎週・判断が必要）",
    ),
};

// ---------------------------------------------------------------------------
// 集客・SNS
// ---------------------------------------------------------------------------

const marketingStatus: TaskTemplate = {
  key: "status",
  title: "部門別の集客の現状と課題の整理",
  description: "鍼灸・整骨院／美容／巻き爪ごとに、新規の入口と弱いところを整理する。",
  teamId: "growth",
  assigneeId: "matsumoto",
  businessUnits: ["seikotsu", "beauty", "makizume"],
  approveComment: "部門ごとに入口が違うことが整理できている。承認します。",
  body: () =>
    lines(
      "■ 部門別の集客の入口（仮説）",
      "・鍼灸・整骨院：Googleマップ検索と口コミ、紹介。課題＝口コミの依頼が習慣化していない",
      "・美容：Instagram・ホットペッパー等。課題＝投稿が不定期、施術例の写真が少ない",
      "・巻き爪：検索（「巻き爪 地域名」）。課題＝専門性が伝わるページがない",
      "",
      "■ 確認したい数字（データが取れる院から）",
      "・部門別の新規数、新規の来院経路、2回目来院率",
    ),
};

const marketingPlan: TaskTemplate = {
  key: "plan",
  title: "今月の集客施策（部門別）",
  description: "今月すぐに実行できる施策を部門ごとに2つずつ決める。",
  teamId: "growth",
  assigneeId: "matsumoto",
  dependsOn: ["status"],
  businessUnits: ["seikotsu", "beauty", "makizume"],
  approveComment: "費用をかけずに今月できるものに絞れている。承認します。",
  body: () =>
    lines(
      "■ 鍼灸・整骨院",
      "1. 会計時に口コミ依頼カードを渡す（満足度の高い患者様に限定）",
      "2. 既存患者様の紹介カード（紹介した方・された方の双方に特典）",
      "■ 美容",
      "1. 施術前後の写真（同意を得た方のみ）を週2回投稿",
      "2. 整骨院の患者様へ美容鍼の体験案内（院内POP）",
      "■ 巻き爪",
      "1. 「巻き爪の相談」ページを作り、Googleマップから誘導",
      "2. 整骨院の高齢の患者様へ足の悩みの声かけ",
    ),
};

const marketingKpi: TaskTemplate = {
  key: "kpi",
  title: "施策の数字目標と記録のしかた",
  description: "施策ごとに、何を数えれば効果が分かるかを決め、集計表を用意する。",
  teamId: "org",
  assigneeId: "yoshida",
  dependsOn: ["plan"],
  approveComment: "現場の負担が少ない記録方法になっている。承認します。",
  body: () =>
    lines(
      "■ 記録する数字（毎日・受付で1タップ）",
      "・新規の来院経路：口コミ／紹介／SNS／検索／チラシ／その他",
      "・紹介カードの配布数と利用数",
      "■ 月末に見る数字",
      "・部門別の新規数、SNS経由の集客数、口コミ件数の増加",
    ),
};

const marketingPost: TaskTemplate = {
  key: "post",
  title: "今月の告知投稿（承認後に公開）",
  description: "今月の施策を知らせる最初の投稿文を作成し、承認後に公開する。",
  teamId: "growth",
  assigneeId: "matsumoto",
  dependsOn: ["plan"],
  requiresApproval: "sns_post",
  approvalMeta: {
    expectedEffect: "今月の施策の認知が広がり、紹介・口コミ経由の新規につながる。",
    risk: "公開後は多くの人の目に触れる。誇大な表現や、患者様が特定できる情報が入ると信用を損なう。",
  },
  approveComment: "医療広告として問題になる表現がなく、個人が特定できる情報もない。承認します。",
  body: () =>
    lines(
      "■ 投稿文（下書き・未公開）",
      "「いつも来てくださる皆さまへ。",
      " 今月から『ご紹介カード』を始めました。",
      " 大切な方の体の不調、ひとりで抱えていませんか？",
      " 心も体も豊かに、笑顔で過ごせるように。スタッフ一同お待ちしています。」",
      "",
      "■ 注意",
      "・効果を断定する表現（「必ず治る」等）は使わない",
      "・患者様の写真・名前は使わない",
    ),
};

const snsCause: TaskTemplate = {
  key: "cause",
  title: "SNSが続かない・成果が出ない原因の分析",
  description: "今のSNS運用の止まりどころと、成果が出ない理由を整理する。",
  teamId: "growth",
  assigneeId: "matsumoto",
  approveComment: "「続かない」の原因が仕組みの問題として整理されている。承認します。",
  body: () =>
    lines(
      "■ 続かない原因（よくあるパターン）",
      "1. ネタを毎回ゼロから考えている",
      "2. 担当が決まっておらず、忙しい日に止まる",
      "3. 何を見て成功とするか決まっていない",
      "",
      "■ 成果が出ない原因",
      "・部門ごとに見せたい相手が違うのに、1つのアカウントで混ざっている",
      "・来院につながる導線（予約リンク・LINE）が投稿にない",
    ),
};

const snsTemplates: TaskTemplate = {
  key: "templates",
  title: "投稿の型とネタ帳（30本）",
  description: "考えなくても投稿できるよう、型を決めてネタを30本用意する。",
  teamId: "growth",
  assigneeId: "matsumoto",
  dependsOn: ["cause"],
  businessUnits: ["seikotsu", "beauty", "makizume"],
  demoRevision: true,
  revisionComment: "部門ごとの本数の配分が書かれていない。来院につながりやすい部門を多めにしてください。",
  approveComment: "部門ごとの配分と、予約への導線が入った。承認します。",
  body: (revision) =>
    lines(
      "■ 投稿の型（4つだけ）",
      "1. お悩み解説（例：朝起きた時の腰痛の原因3つ）",
      "2. セルフケア（30秒でできるストレッチ）",
      "3. スタッフ紹介（理念「心豊笑幸」を自分の言葉で）",
      "4. よくある質問（保険は使える？痛くない？）",
      "",
      "■ ネタ帳：30本（型×部門で作成済み・下書き）",
      ...(revision > 0
        ? ["", "■【修正】部門ごとの配分", "・鍼灸・整骨院 14本／美容 10本／巻き爪 6本", "・すべての投稿の最後に予約リンクを入れる"]
        : []),
    ),
};

const snsFlow: TaskTemplate = {
  key: "flow",
  title: "週1回で回る運用フローと役割分担",
  description: "院の業務の中で無理なく続く投稿の流れと担当を決める。",
  teamId: "org",
  assigneeId: "yoshida",
  dependsOn: ["templates"],
  approveComment: "週1回30分で回る現実的な流れ。承認します。",
  body: () =>
    lines(
      "■ 週1回30分の運用",
      "月曜：AI部門がネタ帳から下書きを3本作成",
      "火曜：統括責任者が確認・承認",
      "水・金・日：予約投稿で自動公開",
      "",
      "■ 記録：月末に投稿数・保存数・SNS経由の新規数を集計",
    ),
};

const snsFirstPost: TaskTemplate = {
  ...marketingPost,
  key: "first-post",
  title: "仕組みの第1回投稿（承認後に公開）",
  dependsOn: ["flow"],
};

// ---------------------------------------------------------------------------
// お金・事務・3億円計画
// ---------------------------------------------------------------------------

const moneyItems: TaskTemplate = {
  key: "items",
  title: "収入・支出の項目整理",
  description: "会社のお金の入口と出口を項目ごとに書き出し、部門に振り分けるルールを決める。",
  teamId: "org",
  assigneeId: "ishikawa",
  businessUnits: ["seikotsu", "beauty", "makizume"],
  approveComment: "部門への振り分けルールが明確。承認します。",
  body: () =>
    lines(
      "■ 収入",
      "・保険診療（療養費の請求分）／窓口の自己負担／自費施術／回数券・プリペイド／物販",
      "■ 支出",
      "・人件費／家賃／材料費（鍼・テープ・巻き爪の器具）／広告費／システム利用料／その他",
      "",
      "■ 部門への振り分け",
      "・売上はメニューで判定（鍼灸・整骨院／美容／巻き爪）",
      "・共通費（家賃・受付人件費）は売上の比率で按分",
      "",
      "■ 注意：保険請求分は入金が2〜3か月遅れる。「売上」と「入金」を分けて管理する",
    ),
};

const moneyDashboard: TaskTemplate = {
  key: "visual",
  title: "部門別収支の見える化フォーマット",
  description: "毎月1枚で、部門別の売上・費用・利益と、目標との差が分かる表を作る。",
  teamId: "org",
  assigneeId: "ishikawa",
  dependsOn: ["items"],
  demoRevision: true,
  revisionComment: "保険請求の入金ずれが表で区別されていない。「売上」と「実際の入金」を別の行にしてください。",
  approveComment: "売上と入金が分かれ、資金繰りも見えるようになった。承認します。",
  body: (revision) =>
    lines(
      "■ 月次収支表（1枚）",
      "行：売上（部門別）／費用（項目別）／部門別利益／累計売上と3億円目標の差",
      "列：今月／先月／前年同月／年度累計",
      "",
      "■ 色分け：目標比90%未満は黄色、80%未満は赤",
      ...(revision > 0
        ? ["", "■【修正】入金の行を追加", "・保険請求：請求額／入金予定月／入金済み", "・月末の現預金残高と、翌月の支払予定"]
        : []),
    ),
};

const moneyClose: TaskTemplate = {
  key: "close",
  title: "月次締めの流れ（誰が・いつ・何を）",
  description: "毎月の数字が5営業日以内にそろう締めの流れを決める。",
  teamId: "org",
  assigneeId: "yoshida",
  dependsOn: ["visual"],
  approveComment: "締めの期限と担当がはっきりしている。承認します。",
  body: () =>
    lines(
      "■ 月次締め",
      "1日：各院が会計データを確定（会計システムがある院はデータを出力）",
      "3日：AI部門が部門別に集計し、収支表を作成",
      "5日：統括責任者が確認 → 代表へ報告",
      "",
      "■ システムがない院：紙の日報を写真で共有し、手入力で集計（当面）",
    ),
};

const adminInventory: TaskTemplate = {
  key: "inventory",
  title: "事務作業の棚卸し（時間つき）",
  description: "院で発生している事務作業を書き出し、1か月あたりの時間を見積もる。",
  teamId: "org",
  assigneeId: "yoshida",
  approveComment: "時間の見積もりがあり、削減効果を比べられる。承認します。",
  body: () =>
    lines(
      "■ 事務作業と月あたりの時間（架空の見積もり）",
      "・保険請求の準備：20時間",
      "・売上・来院数の集計（手作業）：12時間",
      "・シフト作成・調整：8時間",
      "・予約の電話対応・リマインド：15時間",
      "・備品の発注・在庫確認：4時間",
      "・スタッフの勤怠集計：6時間",
      "合計：約65時間／月",
    ),
};

const adminReduce: TaskTemplate = {
  key: "reduce",
  title: "ムダの削減案と優先順位",
  description: "削減できる時間と難しさで、取り組む順番を決める。",
  teamId: "org",
  assigneeId: "yoshida",
  dependsOn: ["inventory"],
  demoRevision: true,
  revisionComment: "費用がかかる案と、かからない案が混ざっている。費用の有無を明記してください。",
  approveComment: "費用の有無が分かり、すぐ始められるものから並んでいる。承認します。",
  body: (revision) =>
    lines(
      "■ 優先順位（削減時間が大きく、すぐできる順）",
      "1. 売上・来院数の集計を、会計データからの自動集計に切り替え（−10時間）",
      "2. 予約リマインドを自動送信に統一（−8時間）",
      "3. シフト作成をテンプレート化（−4時間）",
      "4. 勤怠集計の自動化（−5時間）",
      "",
      "■ 想定効果：月 約27時間の削減（事務員を新たに雇わずに対応）",
      ...(revision > 0
        ? ["", "■【修正】費用", "・1・3：追加費用なし（今あるシステム・表計算で対応）", "・2：既存の予約システムの機能で対応できる院は費用なし", "・4：勤怠システムの導入が必要な場合は費用発生 → 承認を依頼"]
        : []),
    ),
};

const adminMeasure: TaskTemplate = {
  key: "measure",
  title: "削減時間の測り方（導入前後の記録）",
  description: "改善の前後で作業時間を記録し、導入の効果を数字で残す。",
  teamId: "org",
  assigneeId: "ishikawa",
  dependsOn: ["reduce"],
  approveComment: "導入前の数字を先に取る手順になっていて良い。承認します。",
  body: () =>
    lines(
      "■ 記録のしかた",
      "・改善前の2週間：対象作業の時間を記録（開始・終了をメモ）",
      "・改善後の2週間：同じ方法で記録",
      "・差を「事務作業時間の削減量」としてKPIに記録",
      "",
      "■ この記録は、将来の導入事例にも使える（社外に出す場合は代表の承認後、匿名化して使用）",
    ),
};

const revenueGap: TaskTemplate = {
  key: "gap",
  title: "現状の売上と3億円とのギャップ",
  description: "現在の年間売上（1〜2億円規模）と3億円の差を、部門別に整理する。",
  teamId: "org",
  assigneeId: "ishikawa",
  businessUnits: ["seikotsu", "beauty", "makizume"],
  approveComment: "前提が明記され、実データに置き換えれば使える。承認します。",
  body: () =>
    lines(
      "■ 前提（ヒアリング結果と架空の配分）",
      "・現在の年間売上：1〜2億円（全部門合計）→ 試算は1.5億円で計算",
      "・目標：2026年7月〜2027年6月の年間売上 3億円（月平均2,500万円）",
      "",
      "■ ギャップ：年1.5億円（月1,250万円）の上積みが必要",
      "",
      "■ 部門別（架空の配分）",
      "・鍼灸・整骨院：現在 1.1億 → 目標 1.8億",
      "・美容：現在 0.25億 → 目標 0.7億",
      "・巻き爪：現在 0.15億 → 目標 0.5億",
      "",
      "※ 実際の部門別売上を入力すると、ここを実データで計算できます",
    ),
};

const revenueBreakdown: TaskTemplate = {
  key: "breakdown",
  title: "部門別の目標分解（客数×単価×回数）",
  description: "部門ごとに、新規数・リピート・単価のどれをどれだけ伸ばすかに分解する。",
  teamId: "org",
  assigneeId: "ishikawa",
  dependsOn: ["gap"],
  businessUnits: ["seikotsu", "beauty", "makizume"],
  demoRevision: true,
  revisionComment: "今の人数で施術できる上限（キャパシティ）が考慮されていない。施術枠の上限を入れてください。",
  approveComment: "施術枠の上限まで入り、採用や出店が必要なポイントが見えた。承認します。",
  body: (revision) =>
    lines(
      "■ 売上 ＝ 来院数 × 単価",
      "・鍼灸・整骨院：自費メニューの比率を上げ、単価を上げる（回数券の提案）",
      "・美容：整骨院の患者様からの体験で新規を増やす",
      "・巻き爪：検索からの新規を増やし、継続の矯正につなげる",
      "",
      "■ 月次で見る数字：部門別の新規数・リピート数・単価",
      ...(revision > 0
        ? [
            "",
            "■【修正】施術枠の上限（キャパシティ）",
            "・今の人数での上限は年2.4億円前後（架空）→ 3億円には人員か営業時間の拡大が必要",
            "・採用計画は評価制度（クラス）とセットで進める",
          ]
        : []),
    ),
};

const revenueActions: TaskTemplate = {
  key: "actions",
  title: "部門別の打ち手（集客・単価・新しい柱）",
  description: "目標分解に合わせて、部門ごとの打ち手と、商品開発・法人営業の着手時期を決める。",
  teamId: "growth",
  assigneeId: "matsumoto",
  dependsOn: ["breakdown"],
  businessUnits: ["seikotsu", "beauty", "makizume"],
  approveComment: "部門ごとの打ち手と、新しい柱を始める時期が整理されている。承認します。",
  body: () =>
    lines(
      "■ 鍼灸・整骨院：口コミと紹介の仕組み化、回数券の提案の標準化",
      "■ 美容：整骨院からの体験導線、施術例の発信",
      "■ 巻き爪：専門ページと地域検索の強化",
      "■ 新しい柱：商品開発と法人（企業）営業",
      "・今は待機中の商品開発・法人営業担当を、評価制度の確定後に有効化することを提案",
    ),
};

const revenueTracking: TaskTemplate = {
  key: "tracking",
  title: "月次の進捗管理ルール",
  description: "3億円の進み具合を毎月確認し、遅れたときの動き方を決める。",
  teamId: "org",
  assigneeId: "ishikawa",
  dependsOn: ["actions"],
  approveComment: "遅れたときの判断基準があり、運用できる。承認します。",
  body: () =>
    lines(
      "■ 毎月5営業日以内：部門別の売上をダッシュボードに入力",
      "■ 判断基準：累計が目標ペースの90%未満なら、翌月の施策を司令塔が見直し提案",
      "■ 四半期ごと：代表へ報告（達成見込み・必要な投資）",
    ),
};

// ---------------------------------------------------------------------------
// 商品開発・法人営業（担当者は待機中。承認後に着手）
// ---------------------------------------------------------------------------

const productIdeas: TaskTemplate = {
  key: "ideas",
  title: "商品開発の候補（院の強みを活かすもの）",
  description: "施術の知見を活かした商品・サービスの候補を3つ出す。",
  teamId: "growth",
  assigneeId: "nishimura",
  approveComment: "院の強みとつながっていて、個人・法人の両方に展開できる。承認します。",
  body: () =>
    lines(
      "■ 候補（案）",
      "1. セルフケア商品（ストレッチ用品・テーピングのセット）＋動画",
      "2. 企業向け「肩こり・腰痛予防の出張ケア」",
      "3. 巻き爪の予防ケアセット",
    ),
};

const corporatePitch: TaskTemplate = {
  key: "pitch",
  title: "法人向け提案資料の骨子",
  description: "企業の健康経営に向けた提案の骨子を作る。",
  teamId: "growth",
  assigneeId: "nishimura",
  dependsOn: ["ideas"],
  approveComment: "相手の得（欠勤・生産性）から書かれている。承認します。",
  body: () =>
    lines(
      "■ 提案の骨子",
      "・企業の困りごと：肩こり・腰痛による生産性の低下",
      "・提案：月1回の出張ケア＋セルフケア講座",
      "・効果の測り方：参加者アンケート（痛みの変化）",
      "※ 実際の提案送信は承認が必要（法人向けは代表の決裁を推奨）",
    ),
};

// ---------------------------------------------------------------------------
// 課題の発見と優先順位
// ---------------------------------------------------------------------------

const issuesFind: TaskTemplate = {
  key: "find",
  title: "業務の中の課題の洗い出し",
  description: "今わかっている課題に加え、日々の業務・データから新しい課題を探す。",
  teamId: "org",
  assigneeId: "yoshida",
  approveComment: "現場で起きていることから課題が拾えている。承認します。",
  body: () =>
    lines(
      "■ 新たに見つかった課題の候補（デモ）",
      "・スタッフごとに会計の入力方法が違い、集計がずれる",
      "・休暇・シフトの希望がLINEで個別に届き、集約に時間がかかる",
      "・新人研修の内容が院長ごとに違う",
      "",
      "■ 課題の見つけ方（継続）",
      "・毎週、AI部門の作業の中で「止まった・やり直した」箇所を記録",
    ),
};

const issuesPriority: TaskTemplate = {
  key: "priority",
  title: "影響度・緊急度による優先順位づけ",
  description: "課題ごとに影響度と緊急度を評価し、取り組む順番を提案する。",
  teamId: "org",
  assigneeId: "ishikawa",
  dependsOn: ["find"],
  approveComment: "優先順位の理由が数字で説明されている。承認します。",
  body: () =>
    lines(
      "■ 優先順位の付け方：影響度（1〜5）×緊急度（1〜5）",
      "1位 評価制度・キャリア制度がない（25）→ MISSION 001で対応中",
      "2位 集客が弱い（20）・お金の流れが見えない（20）",
      "4位 事務作業が遅い（16）・データ集計が曖昧（16）",
      "",
      "■ 提案：評価制度と並行して「お金の見える化」を始める（月次の数字がないと3億円の進捗が追えないため）",
    ),
};

// ---------------------------------------------------------------------------
// 汎用
// ---------------------------------------------------------------------------

const generalResearch: TaskTemplate = {
  key: "clarify",
  title: "指示の論点整理",
  description: "指示の目的を、会社の土台づくり・売上・時間削減の観点で整理する。",
  teamId: "org",
  assigneeId: "yoshida",
  approveComment: "論点が整理され、次の指示につなげられる。承認します。",
  body: () =>
    lines(
      "■ 論点整理",
      "・この指示で良くしたいのは：会社の土台／売上／時間のどれか",
      "・関係する部門：鍼灸・整骨院／美容／巻き爪",
      "・次の一手：統括責任者に目的を確認し、具体的な指示に置き換える",
    ),
};

// ---------------------------------------------------------------------------

const PLAYBOOKS: Record<string, IntentPlaybook> = {
  mission: {
    intent: "mission",
    label: "MISSION 001の推進",
    priority: "高",
    priorityReason: "評価制度とクラスは会社の土台。後継者育成・採用・3億円の人員計画すべての前提になる。",
    understanding: "MISSION 001「スタッフの評価基準とクラス（等級）を確定させる」を最後まで進める指示と判断しました。",
    concern: "評価は処遇に直結します。案は早く作りますが、確定は少人数の試行と代表の決裁を経てからにします。",
    issueIds: ["i-eval", "i-succession"],
    project: {
      title: "MISSION 001：評価基準とクラス（等級）の確定",
      objective: "5つの評価軸・6段階のクラス・昇格条件を作り、試行のうえ代表の決裁で確定する。",
      leadId: "morimoto",
    },
    tasks: [currentState, evaluationAxes, pcSkill, grades, payLink, trialPlan, decideEvaluation],
  },
  evaluation: {
    intent: "evaluation",
    label: "評価制度の設計",
    priority: "高",
    priorityReason: "MISSION 001の中心。運用が自由すぎる今の状態を変える一番の手段。",
    understanding: "スタッフの評価制度（評価軸・配点・評価シート・運用ルール）を作る指示と判断しました。",
    issueIds: ["i-eval"],
    project: {
      title: "評価制度：誰が評価しても同じ結果になる仕組み",
      objective: "評価軸と配点、評価シート、運用ルールを作り、代表の決裁で確定する。",
      leadId: "morimoto",
    },
    tasks: [evalHearing, { ...evaluationAxes, dependsOn: ["hearing"], milestone: undefined }, evalSheet, evalOps, evalDecide],
  },
  grade: {
    intent: "grade",
    label: "クラス（等級）の設計",
    priority: "高",
    priorityReason: "MISSION 001の中心。キャリアの道筋がないことが、育成と定着の課題になっている。",
    understanding: "クラス（等級）の案と昇格条件、部門別の技術基準を作る指示と判断しました。",
    issueIds: ["i-eval", "i-succession"],
    project: {
      title: "クラス（等級）：6段階のキャリアの道筋",
      objective: "全社共通の6等級と部門別の技術基準・給与レンジ案を作り、代表の決裁で確定する。",
      leadId: "morimoto",
    },
    tasks: [
      { ...grades, dependsOn: [], milestone: undefined },
      gradeBenchmarks,
      { ...payLink, dependsOn: ["grades"] },
      gradeDecide,
    ],
  },
  succession: {
    intent: "succession",
    label: "後継者育成の計画",
    priority: "中",
    priorityReason: "重要だが、評価制度（クラス）が決まると育成の目標が明確になるため、並行して準備する。",
    understanding: "院長・部門長の後継者を育てる計画を立てる指示と判断しました。",
    concern: "後継者の要件は評価制度とつながっていないと形だけになります。クラス案と同じ言葉で定義します。",
    issueIds: ["i-succession"],
    project: {
      title: "後継者育成：12か月で院を任せられる人を育てる",
      objective: "後継者の要件、育成ロードマップ、院長業務のマニュアル化計画を作る。",
      leadId: "morimoto",
    },
    tasks: [successionReq, successionRoadmap, successionManual],
  },
  marketing: {
    intent: "marketing",
    label: "今月の集客",
    priority: "高",
    priorityReason: "集客の弱さは3億円の最大のボトルネック。費用をかけずに今月できることから始める。",
    understanding: "部門別（鍼灸・整骨院／美容／巻き爪）に、今月の集客施策を考える指示と判断しました。",
    issueIds: ["i-acquisition"],
    project: {
      title: "今月の集客：部門別に費用をかけずにできる施策",
      objective: "部門ごとの入口と課題を整理し、今月の施策・記録方法・告知投稿を用意する。",
      leadId: "nomura",
    },
    tasks: [marketingStatus, marketingPlan, marketingKpi, marketingPost],
  },
  sns: {
    intent: "sns",
    label: "SNSを続けられる仕組みづくり",
    priority: "中",
    priorityReason: "続けば集客の資産になるが、成果が出るまで時間がかかる。仕組み化で現場の負担を減らす。",
    understanding: "SNSを無理なく続け、来院につなげる仕組みを作る指示と判断しました。",
    concern: "SNSだけで集客を解決しようとはしません。口コミ・紹介と組み合わせ、予約への導線を必ず入れます。",
    issueIds: ["i-sns", "i-acquisition"],
    project: {
      title: "SNS：週1回30分で続く運用の仕組み",
      objective: "続かない原因を取り除き、投稿の型・ネタ帳・運用フローを作って初回投稿まで進める。",
      leadId: "nomura",
    },
    tasks: [snsCause, snsTemplates, snsFlow, snsFirstPost],
  },
  finance: {
    intent: "finance",
    label: "お金の流れの整理",
    priority: "高",
    priorityReason: "お金の流れが見えないと、3億円の進捗も投資の判断もできない。",
    understanding: "会社のお金の入口と出口を整理し、部門別に見える化する指示と判断しました。",
    issueIds: ["i-money", "i-data"],
    project: {
      title: "お金の見える化：部門別の月次収支を1枚に",
      objective: "収入・支出の項目と部門への振り分けを決め、月次収支表と締めの流れを作る。",
      leadId: "morimoto",
    },
    tasks: [moneyItems, moneyDashboard, moneyClose],
  },
  admin_ops: {
    intent: "admin_ops",
    label: "事務作業のムダの洗い出し",
    priority: "中",
    priorityReason: "事務員がいない状態で現場の時間を奪っている。削減した時間は施術と育成に回せる。",
    understanding: "事務作業を棚卸しし、ムダを減らす順番を決める指示と判断しました。",
    issueIds: ["i-admin", "i-system", "i-data"],
    project: {
      title: "事務の効率化：事務員を雇わずに回る仕組み",
      objective: "事務作業と時間を棚卸しし、削減案の優先順位と効果の測り方を決める。",
      leadId: "morimoto",
    },
    tasks: [adminInventory, adminReduce, adminMeasure],
  },
  revenue_plan: {
    intent: "revenue_plan",
    label: "年間売上3億円の計画",
    priority: "高",
    priorityReason: "会社の最重要目標。期間（2026年7月〜2027年6月）がすでに始まっている。",
    understanding: "2026年7月〜2027年6月の年間売上3億円（全部門合計）を達成する計画を立てる指示と判断しました。",
    concern:
      "今の人数のままでは施術枠が足りない可能性が高いです。集客だけでなく、採用・評価制度とセットで考える必要があります。",
    issueIds: ["i-acquisition", "i-money", "i-data"],
    project: {
      title: "3億円計画：部門別の目標と打ち手",
      objective: "現状とのギャップを部門別に分解し、打ち手と月次の進捗管理ルールを決める。",
      leadId: "morimoto",
    },
    tasks: [revenueGap, revenueBreakdown, revenueActions, revenueTracking],
  },
  product: {
    intent: "product",
    label: "商品開発・法人営業の準備",
    priority: "低",
    priorityReason: "今後の柱だが、今は会社の土台（評価制度・お金の見える化）を優先する段階。",
    understanding: "商品開発・法人（企業）営業の準備を始める指示と判断しました。",
    concern: "担当の西村は待機中です。有効化には承認が必要で、承認されるまでこのTaskは着手しません。",
    issueIds: ["i-acquisition"],
    project: {
      title: "新しい柱：商品開発と法人営業の準備",
      objective: "院の強みを活かした商品候補と、法人向け提案の骨子を作る。",
      leadId: "nomura",
    },
    tasks: [productIdeas, corporatePitch],
  },
  issues: {
    intent: "issues",
    label: "課題の発見と優先順位づけ",
    priority: "中",
    priorityReason: "課題は今後も出てくる。優先順位を決めておくと、AI部門の時間を一番効くところに使える。",
    understanding: "業務の中から課題を見つけ、影響度と緊急度で優先順位をつける指示と判断しました。",
    issueIds: [],
    project: {
      title: "課題の棚卸し：今いちばん効く順番",
      objective: "新しい課題を洗い出し、既知の課題とあわせて優先順位を提案する。",
      leadId: "morimoto",
    },
    tasks: [issuesFind, issuesPriority],
  },
  general: {
    intent: "general",
    label: "その他の指示",
    priority: "低",
    priorityReason: "MISSION 001・3億円との関係がまだ不明確なため、まず論点整理から。",
    understanding: "指示の目的を、会社の土台・売上・時間削減の観点で整理するところから始めます。",
    issueIds: [],
    project: {
      title: "指示の論点整理",
      objective: "指示の目的と、MISSION 001・3億円への貢献度を明確にする。",
      leadId: "morimoto",
    },
    tasks: [generalResearch],
  },
};

export const PLAYBOOK: Playbook = {
  classifyIntent,
  extraConcern,
  playbooks: PLAYBOOKS,
  intentLabels: {
    ...Object.fromEntries(Object.values(PLAYBOOKS).map((p) => [p.intent, p.label])),
    status_report: "状況報告",
    staffing: "AI部門の人員配置の検討",
  },
  staffing: [
    {
      memberId: "nishimura",
      triggerIntents: ["product"],
      loadTeamId: "growth",
      loadThreshold: 4,
      reason: "商品開発・法人営業に着手するため（または事業成長チームの未完了Taskが多いため）。",
      expectedEffect: "商品候補と法人向け提案の準備を進め、3億円に向けた新しい柱を作れる。",
      monthlyCostJpy: 3000,
    },
  ],
};
