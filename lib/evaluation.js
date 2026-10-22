// 等級別の月次評価（数値＋行動＋基本＋部門。評価は「獲得点÷満点×100」で100点満点に換算）
//
// - 評価項目は台帳の「評価項目」シートで管理（無ければ下の既定値）。配点は「評価配分」から自動。合計は100点でなくてよい
// - 評価結果は台帳の「評価記録」シートに1項目1行で保存（月・氏名・項目ID が同じ行は上書き）
// - 数値項目のうち売上・予算達成率・人件費率は進捗売上実績／台帳から自動で入る。それ以外は評価者が入力
// - 行動項目は直属の上司が5段階で採点（点数 = 配点 × 評価 / 5）

import { normName } from "./incentive-calc.js";
import { newPatientMetrics } from "./new-patients.js";

export const ITEM_SHEET = "評価項目";
export const RECORD_SHEET = "評価記録";
export const ITEM_HEADER = ["等級", "区分", "項目ID", "項目名", "配点", "目標値", "単位", "方向", "自動", "必須", "採点基準・説明"];
export const RECORD_HEADER = ["対象月", "氏名", "所属院", "等級", "項目ID", "項目名", "区分", "実績値", "評価(1-5)", "点数", "評価者", "更新日時", "コメント"];

// 自動で入る数値（auto の値）
//   personal_sales: 個人売上（窓口＋保険請求） / clinic_budget: 自院の売上予算達成率(%)
//   clinic_labor: 自院の人件費率(%) / block_budget・block_labor: 担当ブロック / company_budget・company_labor: 全社
// 新患（あんど新規集客シートから自動）
const NEW_COUNT = (points, target) => N("new_count", "新患対応数", points, target, "名", { auto: "new_count", note: "初回施術を担当した新患の人数（巻き爪などは除く）" });
const NEW_CLOSE = (points, target) => N("new_close", "初回成約率", points, target, "%", { auto: "new_close", note: "新患のうち、自費加入（成約）した割合" });
const NEW_SALES = (points, target) => N("new_sales", "初回売上", points, target, "円", { auto: "new_sales", note: "担当した新患の初回窓口金額＋成約金額の合計" });
// 継続率＝担当した新患のうち「通院」に○の割合（院長は自院全体）
const CONTINUE = (points, target) => N("continue_rate", "継続率（初回の通院率）", points, target, "%", { auto: "new_continue", note: "担当した新患のうち、通院（継続）につながった割合" });
const CLINIC_CONTINUE = (points, target) => N("clinic_continue_rate", "自院の継続率（初回の通院率）", points, target, "%", { auto: "clinic_new_continue", note: "自院の新患のうち、通院（継続）につながった割合" });
const PERSONAL_SALES_NOTE = "進捗売上実績の個人売上（窓口実績＋保険請求）";
const N = (id, label, points, target, unit, extra = {}) => ({ kind: "数値", id, label, points, target, unit, direction: "以上", auto: "", required: false, note: "", ...extra });
const B = (id, label, points, note, extra = {}) => ({ kind: "行動", id, label, points, target: null, unit: "", direction: "", auto: "", required: false, note, ...extra });

// 全等級共通の「社会人としての基本」（区分「基本」・5段階）。評価項目シートでは等級「共通」の行
export const COMMON_GRADE = "共通";
const C = (id, label, points, note) => ({ kind: "基本", id, label, points, target: null, unit: "", direction: "", auto: "", required: false, note });

export const DEFAULT_ITEMS = {
  [COMMON_GRADE]: [
    C("basic_greeting", "挨拶・言葉遣い", 3, "自分から明るく挨拶し、患者・スタッフに丁寧な言葉遣いができているか"),
    C("basic_appearance", "身だしなみ・清潔感", 3, "髪型・爪・ユニフォーム・匂いなど、清潔感のある身だしなみか"),
    C("basic_punctual", "時間厳守・無遅刻無欠勤", 3, "遅刻・無断欠勤がなく、始業前に準備を終えているか"),
    C("basic_hourensou", "報連相", 3, "報告・連絡・相談を、決められた相手にタイミングよく行えているか"),
    C("basic_rules", "約束・期限・ルールを守る", 3, "提出物や約束の期限、院のルール・整理整頓を守れているか"),
  ],
  G1: [
    N("personal_sales", "個人売上", 10, 700000, "円", { auto: "personal_sales", note: PERSONAL_SALES_NOTE }),
    NEW_COUNT(5, 3),
    NEW_CLOSE(5, 50),
    NEW_SALES(5, 50000),
    N("on_time", "施術枠内時間の遵守率", 5, 90, "%"),
    N("reviews", "口コミ獲得数", 5, 1, "件"),
    B("coachable", "指導の受け入れ・改善", 10, "指導を素直に受け止め、次回までに改善できているか"),
    B("skill_check", "社内実技チェックの進捗", 15, "研修・実技チェックを計画どおり合格しているか"),
    B("cleanliness", "院内美化", 5, "ベッド・待合室・トイレの清掃と整頓"),
    B("philosophy", "理念の理解・体現", 10, "理念に沿った患者対応ができているか"),
    B("pc", "PCスキル", 10, "予約システムの操作・カルテ入力を一人でできる"),
  ],
  G2: [
    N("personal_sales", "個人売上", 15, 700000, "円", { auto: "personal_sales", note: PERSONAL_SALES_NOTE }),
    CONTINUE(10, 75),
    NEW_COUNT(5, 6),
    NEW_CLOSE(5, 60),
    NEW_SALES(5, 100000),
    N("reviews", "口コミ獲得数", 5, 3, "件"),
    B("cleanliness", "院内美化", 5, "清掃・整頓を自分から行っているか"),
    B("self_pay", "自費メニューの提案", 10, "症状に合わせて自費を提案し定着させているか"),
    B("technique", "基本手技の単独完結", 10, "基本手技を一人で最後までできるか"),
    B("philosophy", "理念の理解・体現", 5, "理念に沿った患者対応ができているか"),
    B("pc", "PCスキル", 10, "予約・カルテ・日計表を正確に入力できる"),
  ],
  G3: [
    N("personal_sales", "個人売上", 20, 1000000, "円", { auto: "personal_sales", note: PERSONAL_SALES_NOTE }),
    NEW_CLOSE(10, 70),
    NEW_SALES(10, 150000),
    NEW_COUNT(5, 8),
    CONTINUE(5, 75),
    N("reviews", "口コミ獲得数", 5, 3, "件"),
    B("acting_manager", "院長不在時の代行業務", 5, "院長不在時に受付・スタッフ配置・トラブル対応を任せられるか"),
    B("mentor", "新人の実技メンター", 10, "新人1名の実技指導を計画的に行っているか"),
    B("full_menu", "自費フルメニュー施術・問診成約", 5, "自費メニューを全て施術でき、問診からの成約率が高いか"),
    B("pc", "PCスキル", 10, "日計表・売上集計をスプレッドシートで作成・更新できる"),
  ],
  G4: [
    N("clinic_budget", "自院 売上予算達成率", 20, 100, "%", { auto: "clinic_budget" }),
    N("clinic_labor", "自院 人件費率", 15, 42, "%", { auto: "clinic_labor", direction: "以下" }),
    NEW_COUNT(5, 10),
    NEW_CLOSE(5, 70),
    NEW_SALES(5, 200000),
    CLINIC_CONTINUE(5, 75),
    B("pl", "店舗PL管理・予実管理", 5, "売上・経費・人件費の予実を毎月把握し対策を打てているか"),
    B("shift", "シフト管理・人件費コントロール", 5, "売上に合わせた人員配置ができているか"),
    B("claim", "クレームの一次完結", 5, "クレームを院内で解決し再発防止できているか"),
    B("develop", "部下育成（面談・技術指導）", 5, "月1回の面談と技術指導を行っているか"),
    B("pc", "PC業務（必須）", 10, "PL・シフト・予実表をスプレッドシートで自分で作成・更新できる", { required: true }),
  ],
  G5: [
    N("block_budget", "ブロック 売上予算達成率", 25, 100, "%", { auto: "block_budget" }),
    N("block_labor", "ブロック 人件費率", 20, 42, "%", { auto: "block_labor", direction: "以下" }),
    N("turnover", "エリア離職率", 10, 10, "%", { direction: "以下" }),
    NEW_CLOSE(5, 80),
    B("hiring", "採用面接・人員計画", 5, "採用面接を行い、必要人員を計画的に確保できているか"),
    B("coaching", "院長への予実管理指導", 5, "担当院長の予実管理を毎月レビューしているか"),
    B("tech_review", "技術審査・難治症状指導", 5, "技術審査員として指導できているか"),
    B("pc", "PC業務（必須）", 10, "エリアの予実・人件費データを分析し、資料にまとめられる", { required: true }),
  ],
  G6: [
    N("company_budget", "全社 売上予算達成率", 25, 100, "%", { auto: "company_budget" }),
    N("company_labor", "全社 人件費率", 20, 42, "%", { auto: "company_labor", direction: "以下" }),
    N("profit_rate", "全社 営業利益達成率", 15, 95, "%"),
    B("develop_leaders", "BM・院長の育成", 5, "次期BM・院長を計画的に育成しているか（年2名）"),
    B("strategy", "出店戦略・新業態", 5, "出店・新業態の計画を進めているか"),
    B("standardize", "技術開発・標準化", 5, "全社の技術を標準化し、マニュアル化しているか"),
    B("pc", "PC業務（必須）", 10, "全社KPIダッシュボード・経営資料を作成し、会議を運営できる", { required: true }),
  ],
  "-S": [
    N("slot_fill", "担当枠充足率", 15, 80, "%"),
    CONTINUE(10, 70),
    NEW_COUNT(5, 3),
    NEW_CLOSE(10, 50),
    NEW_SALES(5, 50000),
    B("technique", "G2同等の手技維持", 15, "G2と同じ水準の手技を維持しているか"),
    B("teamwork", "時間内の業務完結・チーム連携", 15, "限られた時間で業務を終え、引き継ぎができているか"),
    B("pc", "PCスキル", 10, "予約システムの操作・カルテ入力を一人でできる"),
  ],
  "-R": [
    N("next_guide", "次回予約誘導率", 20, 70, "%"),
    N("retail", "物販成約数", 10, 10, "件"),
    N("reviews", "口コミ獲得数", 15, 5, "件"),
    B("reception", "電話・対面の接遇", 15, "明るく丁寧な電話・受付対応ができているか"),
    B("waiting", "待合室美化・カルテ管理", 5, "待合室の整頓とカルテの管理"),
    B("receipt", "レセプト点検", 10, "レセプト・請求の不備がないか"),
    B("pc", "PCスキル", 10, "予約システム・日計表入力・レセプト点検をPCで正確にできる"),
  ],
};

// ===== 部門 =====
// 部門の評価項目は「評価項目」シートの等級欄に「部門:集客」のように書く。担当者は「スタッフ設定」シートの「部門」列
export const DEPT_PREFIX = "部門:";
const D = (id, label, points, note) => B(id, label, points, note);
export const DEFAULT_DEPARTMENTS = [
  { name: "教育・業績UP", members: ["岩永"], items: [
    D("d_edu_training", "研修・勉強会の企画と実施", 5, "全社・各院の研修や勉強会を計画どおり実施できたか"),
    D("d_edu_results", "全院の業績改善施策の推進", 5, "業績の上がっていない院への改善策を進め、結果につなげたか") ] },
  { name: "採用", members: ["広川"], items: [
    D("d_rec_activity", "採用活動（求人・面接）の実施", 5, "求人掲載・学校訪問・面接などを計画どおり行えたか"),
    D("d_rec_result", "採用目標の達成", 5, "必要な人数を、求める人材で採用できたか") ] },
  { name: "技術", members: ["蔡"], items: [
    D("d_tech_training", "技術研修・技術チェックの実施", 5, "技術研修や実技チェックを計画どおり行えたか"),
    D("d_tech_standard", "技術マニュアル・標準化の推進", 5, "手技のマニュアル化・全院の技術の統一を進めたか") ] },
  { name: "集客", members: ["伊牟田", "大皿"], items: [
    D("d_mkt_action", "集客施策の企画・実行", 5, "チラシ・SNS・口コミ・イベントなどの施策を企画し実行できたか"),
    D("d_mkt_review", "集客施策の効果検証と改善", 5, "新患数・問い合わせ数の結果を見て、次の改善につなげたか") ] },
  { name: "商品開発", members: ["藤原", "原田"], items: [
    D("d_prod_plan", "新商品・新メニューの企画", 5, "新しい商品・メニューを企画し、形にできたか"),
    D("d_prod_sales", "導入・販売の実績づくり", 5, "企画した商品・メニューを各院に導入し、販売につなげたか") ] },
  { name: "ES（従業員満足）", members: ["藤原", "山田"], items: [
    D("d_es_action", "従業員満足の施策の実施", 5, "働きやすさ・やりがいを高める施策を実施できたか"),
    D("d_es_hearing", "面談・アンケートと改善", 5, "スタッフの声を集め、改善につなげたか") ] },
  { name: "巻き爪", members: ["伊牟田", "大森", "大皿", "木村", "藤井", "定井", "藤原"], items: [
    N("d_nail_count", "巻き爪の新規対応件数", 5, 4, "件", { auto: "nail_count", note: "初回施術を担当した巻き爪の件数（あんど新規集客の症状に「爪」を含む行）" }),
    N("d_nail_clinic_sales", "院の巻き爪売上（月）", 5, 800000, "円", { note: "院全体の巻き爪の月の売上（2回目以降も含む）。院長が入力。目標は1院80万円以上" }) ] },
];
for (const d of DEFAULT_DEPARTMENTS) DEFAULT_ITEMS[DEPT_PREFIX + d.name] = d.items;
export const isDeptKey = (g) => String(g || "").startsWith(DEPT_PREFIX);

export const EVALUATED_GRADES = Object.keys(DEFAULT_ITEMS).filter((g) => g !== COMMON_GRADE && !isDeptKey(g));
export const BASIC_WARN_MAX = 2; // 「基本」で2以下が付いたら注意を出す

// 評価項目の設定画面で選べるクラス（表示順）
export const GRADE_LABELS = {
  [COMMON_GRADE]: "社会人としての基本（全員共通）",
  G1: "G1 新人", G2: "G2 一般スタッフ", G3: "G3 副院長・チーフ", G4: "G4 院長",
  G5: "G5 BM", G6: "G6 GM", "-S": "短時間正社員", "-R": "受付・事務",
};
export const KINDS = ["数値", "行動", "基本"];
export const AUTO_OPTIONS = {
  personal_sales: "個人売上（窓口＋保険請求）",
  personal_visits: "対応人数（個人の施術人数）",
  personal_avg: "平均売上（個人売上÷対応人数）",
  new_count: "新患対応数（初回施術担当）",
  new_close: "初回成約率(%)",
  new_sales: "初回売上（初回窓口＋成約金額）",
  new_first_avg: "初回単価（初回窓口金額の平均）",
  new_continue: "継続率（初回の通院率）(%)",
  clinic_new_count: "自院の新患数",
  nail_count: "巻き爪の対応件数",
  nail_sales: "巻き爪の売上（初回窓口＋成約金額）",
  clinic_new_close: "自院の初回成約率(%)",
  clinic_new_continue: "自院の継続率（初回の通院率）(%)",
  clinic_budget: "自院の売上予算達成率(%)", clinic_labor: "自院の人件費率(%)",
  block_budget: "ブロックの売上予算達成率(%)", block_labor: "ブロックの人件費率(%)",
  company_budget: "全社の売上予算達成率(%)", company_labor: "全社の人件費率(%)",
};

// 設定画面から送られた1クラス分の項目を確認・整形する（不正なら Error）
export function validateItems(grade, list) {
  if (!GRADE_LABELS[grade] && !(isDeptKey(grade) && grade.length > DEPT_PREFIX.length && grade.length <= 30)) throw new Error("クラス・部門が正しくありません");
  if (!Array.isArray(list)) throw new Error("項目が正しくありません");
  if (list.length > 40) throw new Error("項目は40個までです");
  const ids = new Set();
  return list.map((raw, i) => {
    const label = String(raw.label ?? "").trim();
    if (!label) throw new Error(`${i + 1}番目の項目名が空です`);
    const kind = grade === COMMON_GRADE ? "基本" : KINDS.includes(raw.kind) && !(isDeptKey(grade) && raw.kind === "基本") ? raw.kind : "行動";
    const points = 0; // 配点は「評価配分」の％から自動で決まる
    let id = String(raw.id ?? "").trim().replace(/[^\w-]/g, "");
    if (!id || ids.has(id)) id = `item_${Date.now().toString(36)}_${i}`;
    ids.add(id);
    const item = { kind, id, label, points, target: null, unit: "", direction: "", auto: "", required: !!raw.required, note: String(raw.note ?? "").trim() };
    if (kind === "数値") {
      const target = Number(String(raw.target ?? "").replace(/[,%円¥\s]/g, ""));
      if (!Number.isFinite(target) || target <= 0) throw new Error(`「${label}」の目標値を入力してください`);
      item.target = target;
      item.unit = String(raw.unit ?? "").trim().slice(0, 6);
      item.direction = raw.direction === "以下" ? "以下" : "以上";
      item.auto = AUTO_OPTIONS[raw.auto] ? raw.auto : "";
    }
    return item;
  });
}

// その等級の評価項目（等級別の項目 ＋ 共通の「社会人としての基本」）。対象外の等級は null
// depts: その人の担当部門（["集客", "ES（従業員満足）"]）。部門の項目には dept（部門名）を付ける
// 配点は「評価配分」から自動：数値％・行動％・基本％をそれぞれの項目数で等分、部門の点数も項目数で等分。
// 必須の項目には、そのクラスの「必須ライン」（5段階の最低点）を付ける
export function itemsFor(items, grade, depts = [], dist = DEFAULT_DIST) {
  if (!grade || grade === COMMON_GRADE || isDeptKey(grade) || !items[grade]) return null;
  const g = distFor(dist, grade);
  const share = (list, total) => list.map((it) => ({ ...it, points: list.length ? total / list.length : 0, requiredMin: g.line }));
  const own = items[grade];
  const deptItems = depts.flatMap((d) => share(items[DEPT_PREFIX + d] || [], deptPointsFor(dist, d)).map((it) => ({ ...it, dept: d })));
  return [
    ...share(own.filter((it) => it.kind === "数値"), g.num),
    ...share(own.filter((it) => it.kind !== "数値"), g.beh),
    ...share(items[COMMON_GRADE] || [], g.basic),
    ...deptItems,
  ].sort((a, b) => order(a) - order(b));
  function order(it) { // 並び順はシートの順（クラス → 共通 → 部門）
    const lists = [own, items[COMMON_GRADE] || [], ...depts.map((d) => items[DEPT_PREFIX + d] || [])];
    let base = 0;
    for (const l of lists) { const i = l.findIndex((x) => x.id === it.id); if (i >= 0 && (!it.dept || l === items[DEPT_PREFIX + it.dept])) return base + i; base += 1000; }
    return base;
  }
}

// ===== 評価配分（クラスごとの 数値％・行動％・基本％・必須ライン／部門の点数） =====
export const DIST_SHEET = "評価配分";
export const DIST_HEADER = ["区分", "名前", "数値%", "行動%", "基本%", "必須ライン", "部門の点数"];
// 上のクラスほど必須ラインを厳しく（5段階で何点以上が必要か）
export const DEFAULT_DIST = {
  grades: {
    G6: { num: 60, beh: 25, basic: 15, line: 4 }, G5: { num: 60, beh: 25, basic: 15, line: 4 },
    G4: { num: 55, beh: 30, basic: 15, line: 3 }, G3: { num: 55, beh: 30, basic: 15, line: 3 },
    G2: { num: 45, beh: 40, basic: 15, line: 3 }, G1: { num: 35, beh: 50, basic: 15, line: 2 },
    "-S": { num: 45, beh: 40, basic: 15, line: 2 }, "-R": { num: 45, beh: 40, basic: 15, line: 2 },
  },
  depts: {},
  deptDefault: 10,
};
export function distFor(dist, grade) {
  return (dist && dist.grades && dist.grades[grade]) || DEFAULT_DIST.grades[grade] || { num: 50, beh: 35, basic: 15, line: 3 };
}
export function deptPointsFor(dist, dept) {
  const v = dist && dist.depts ? dist.depts[dept] : undefined;
  return v === undefined ? DEFAULT_DIST.deptDefault : v;
}
export function parseDist(rows) {
  const dist = { grades: { ...DEFAULT_DIST.grades }, depts: {}, deptDefault: DEFAULT_DIST.deptDefault };
  if (!rows || rows.length < 2) return dist;
  const head = rows[0].map(normName);
  const c = Object.fromEntries(DIST_HEADER.map((h) => [h, head.indexOf(normName(h))]));
  const n = (v, d) => { const x = Number(String(v ?? "").replace(/[%点\s]/g, "")); return v === "" || v === undefined || v === null || !Number.isFinite(x) ? d : x; };
  for (const r of rows.slice(1)) {
    const type = String(r[c["区分"]] ?? "").trim(), name = String(r[c["名前"]] ?? "").trim();
    if (!name) continue;
    if (type === "部門") dist.depts[name] = n(r[c["部門の点数"]], DEFAULT_DIST.deptDefault);
    else {
      const d = distFor(DEFAULT_DIST, name);
      dist.grades[name] = { num: n(r[c["数値%"]], d.num), beh: n(r[c["行動%"]], d.beh), basic: n(r[c["基本%"]], d.basic), line: Math.max(1, Math.min(5, n(r[c["必須ライン"]], d.line))) };
    }
  }
  return dist;
}
export function distRows(dist) {
  const rows = [DIST_HEADER];
  for (const [g, v] of Object.entries(dist.grades)) rows.push(["クラス", g, v.num, v.beh, v.basic, v.line, ""]);
  for (const [d, pts] of Object.entries(dist.depts)) rows.push(["部門", d, "", "", "", "", pts]);
  return rows;
}
export function validateDist(kind, raw) {
  const n = (v, lo, hi, label) => { const x = Number(v); if (!Number.isFinite(x) || x < lo || x > hi) throw new Error(`${label}は${lo}〜${hi}で入れてください`); return x; };
  if (kind === "部門") return { points: n(raw.points, 0, 100, "部門の点数") };
  const num = n(raw.num, 0, 100, "数値％"), beh = n(raw.beh, 0, 100, "行動％"), basic = n(raw.basic, 0, 100, "基本％");
  if (num + beh + basic <= 0) throw new Error("数値・行動・基本の配点のどれかを入れてください"); // 合計は100でなくてよい（評価は率）
  return { num, beh, basic, line: n(raw.line, 1, 5, "必須ライン") };
}

// 部門の一覧（評価項目シートにある部門）
export function departmentNames(items) {
  return Object.keys(items).filter(isDeptKey).map((k) => k.slice(DEPT_PREFIX.length));
}

// 部門の担当者: 「スタッフ設定」に部門列があればそれ、なければ既定（名字で一致）
export function deptMembership(model, staffSettings, items) {
  const names = departmentNames(items);
  const map = new Map(); // personKey → [部門]
  if (staffSettings && staffSettings.hasDept) {
    for (const [key, e] of staffSettings) if (e.depts && e.depts.length) map.set(key, e.depts.filter((d) => names.includes(d)));
    return map;
  }
  for (const d of DEFAULT_DEPARTMENTS) {
    if (!names.includes(d.name)) continue;
    for (const surname of d.members) {
      const hit = model.people.filter((p) => p.key.startsWith(normName(surname)));
      if (hit.length === 1) map.set(hit[0].key, [...(map.get(hit[0].key) || []), d.name]);
    }
  }
  return map;
}
export const PC_REQUIRED_MIN = 3; // 必須項目は5段階で3未満なら「必須未達」

export function rankOf(score) {
  if (score === null || score === undefined) return null;
  if (score >= 90) return "S";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}

// 「評価項目」シートの中身として書き込む行
export function itemSheetRows(items = DEFAULT_ITEMS) {
  const rows = [ITEM_HEADER];
  for (const [grade, list] of Object.entries(items)) {
    for (const it of list) {
      rows.push([grade, it.kind, it.id, it.label, it.points, it.target ?? "", it.unit, it.direction, it.auto, it.required ? "必須" : "", it.note]);
    }
  }
  return rows;
}

// 「評価項目」シート → { 等級: [項目] }
export function parseItemSheet(rows) {
  if (!rows || rows.length < 2) return null;
  const head = rows[0].map(normName);
  const col = (label) => head.indexOf(label);
  const c = Object.fromEntries(ITEM_HEADER.map((h) => [h, col(normName(h))]));
  const out = {};
  for (const r of rows.slice(1)) {
    const g = String(r[c["等級"]] ?? "").trim();
    const id = String(r[c["項目ID"]] ?? "").trim();
    if (!g || !id) continue;
    const num = (v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace(/[,%円]/g, "")));
    const k = String(r[c["区分"]] ?? "").trim();
    const kind = k === "数値" ? "数値" : k === "基本" ? "基本" : "行動";
    (out[g] = out[g] || []).push({
      kind,
      id, label: String(r[c["項目名"]] ?? id), points: num(r[c["配点"]]) || 0,
      target: num(r[c["目標値"]]), unit: String(r[c["単位"]] ?? ""),
      direction: kind === "数値" ? (String(r[c["方向"]] ?? "").trim() === "以下" ? "以下" : "以上") : "",
      auto: String(r[c["自動"]] ?? "").trim(), required: String(r[c["必須"]] ?? "").includes("必須"),
      note: String(r[c["採点基準・説明"]] ?? ""),
    });
  }
  return Object.keys(out).length ? out : null;
}

// 数値項目の点数: 「以上」は 目標比（上限100%）、「以下」は目標以下で満点・目標+10ポイントで0点
export function numberPoints(item, value) {
  if (value === null || value === undefined || !Number.isFinite(value) || !item.target) return null;
  if (item.direction === "以下") {
    if (value <= item.target) return item.points;
    return item.points * Math.max(0, 1 - (value - item.target) / 10);
  }
  return item.points * Math.max(0, Math.min(1, value / item.target));
}

export function behaviorPoints(item, score) {
  if (!score) return null;
  return item.points * Math.max(0, Math.min(5, score)) / 5;
}

// 1人・1か月の採点（values: 数値の実績、scores: 行動・基本の5段階）
// 月次の点数 ＝ 獲得点 ÷ 満点 × 100（100点満点）（クラス・共通・部門のすべての項目）。配点の合計は100でなくてよい
export function scoreMonth(items, values, scores) {
  const maxPoints = items.reduce((a, it) => a + it.points, 0);
  let earned = 0, filled = 0, deptEarned = 0;
  const lines = items.map((it) => {
    const v = it.kind === "数値" ? values[it.id] ?? null : null;
    const s = it.kind !== "数値" ? scores[it.id] ?? null : null;
    const pts = it.kind === "数値" ? numberPoints(it, v) : behaviorPoints(it, s);
    if (pts !== null) { filled++; earned += pts; if (it.dept) deptEarned += pts; }
    return { id: it.id, value: v, score: s, points: pts === null ? null : Math.round(pts * 10) / 10 };
  });
  const complete = filled === items.length;
  const total = filled && maxPoints ? Math.round((earned / maxPoints) * 1000) / 10 : null; // ％
  const sub = (kind) => {
    const its = items.filter((it) => !it.dept && it.kind === kind);
    const max = its.reduce((a, it) => a + it.points, 0);
    const got = lines.filter((l, i) => !items[i].dept && items[i].kind === kind && l.points !== null).reduce((a, l) => a + l.points, 0);
    return { max: Math.round(max * 10) / 10, earned: Math.round(got * 10) / 10 };
  };
  const deptMax = items.filter((it) => it.dept).reduce((a, it) => a + it.points, 0);
  const requiredMissed = items.filter((it) => it.required && (it.kind === "数値"
    ? values[it.id] != null && numberPoints(it, values[it.id]) !== null && numberPoints(it, values[it.id]) < it.points - 1e-9
    : scores[it.id] && scores[it.id] < (it.requiredMin || PC_REQUIRED_MIN))).map((it) => it.label);
  const basicIssues = items.filter((it) => it.kind === "基本" && scores[it.id] && scores[it.id] <= BASIC_WARN_MAX).map((it) => it.label);
  return {
    lines, total, rank: complete ? rankOf(total) : null, complete, filled, count: items.length,
    earned: Math.round(earned * 10) / 10, max: Math.round(maxPoints * 10) / 10,
    depts: { max: Math.round(deptMax * 10) / 10, earned: Math.round(deptEarned * 10) / 10 },
    numbers: sub("数値"), behaviors: sub("行動"), basics: sub("基本"), requiredMissed, basicIssues,
  };
}

// "2027-01" → { year, month, fiscalYear }
export function parseMonthKey(key) {
  const m = String(key || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]), month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month, fiscalYear: month >= 7 ? year : year - 1 };
}

export function monthKeyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// 同じ半期（1〜6月 / 7〜12月）の月キー一覧
export function halfMonthKeys(key) {
  const p = parseMonthKey(key);
  if (!p) return [];
  const start = p.month >= 7 ? 7 : 1;
  return Array.from({ length: 6 }, (_, i) => `${p.year}-${String(start + i).padStart(2, "0")}`);
}

// 自動で入る数値（売上・予算達成率・人件費率）
export function autoValues(model, person, monthKey, np) {
  const p = parseMonthKey(monthKey);
  const out = {};
  if (!p) return out;
  // 新患（あんど新規集客シート。日付つきなので年度に関係なく使える）
  if (np) {
    const mine = np.byPerson && np.byPerson.get(person.key);
    Object.assign(out, newPatientMetrics(mine && mine[monthKey]));
    const stats = person.clinics.map((c) => np.byClinic && np.byClinic.get(c) && np.byClinic.get(c)[monthKey]).filter(Boolean);
    if (person.clinics.length) {
      const sum = stats.reduce((a, s) => ({ count: a.count + s.count, closed: a.closed + s.closed, firstPay: a.firstPay + s.firstPay, contract: a.contract + s.contract, continued: a.continued + s.continued, closeBase: a.closeBase + (s.closeBase ?? s.count), contBase: a.contBase + (s.contBase ?? s.count) }), { count: 0, closed: 0, firstPay: 0, contract: 0, continued: 0, closeBase: 0, contBase: 0 });
      const cm = newPatientMetrics(sum);
      out.clinic_new_count = cm.new_count;
      if (cm.new_close !== undefined) out.clinic_new_close = cm.new_close;
      if (cm.new_continue !== undefined) out.clinic_new_continue = cm.new_continue;
    }
  }
  if (p.fiscalYear !== model.fiscalYear) return out; // 売上シートは今年度分だけ
  const m = p.month;
  const ms = person.monthlySales && person.monthlySales.find((x) => x.month === m);
  if (ms && ms.total !== null) out.personal_sales = Math.round(ms.total);
  if (ms && ms.count) {
    out.personal_visits = ms.count;
    if (ms.total !== null) out.personal_avg = Math.round(ms.total / ms.count);
  }

  const clinicMonth = (c) => c.months.find((x) => x.month === m) || {};
  const rateOf = (cs) => {
    const budget = cs.reduce((a, c) => a + (clinicMonth(c).actual != null ? clinicMonth(c).budget || 0 : 0), 0);
    const actual = cs.reduce((a, c) => a + (clinicMonth(c).actual || 0), 0);
    return budget ? Math.round((actual / budget) * 1000) / 10 : null;
  };
  const laborOf = (cs) => {
    if (cs.some((c) => c.fixedLabor == null)) return null;
    const actual = cs.reduce((a, c) => a + (clinicMonth(c).actual || 0), 0);
    return actual ? Math.round((cs.reduce((a, c) => a + c.fixedLabor, 0) / actual) * 1000) / 10 : null;
  };
  const own = model.clinics.filter((c) => person.clinics.includes(c.name));
  if (own.length) { out.clinic_budget = rateOf(own); out.clinic_labor = laborOf(own); }
  const blockClinics = model.blocks.filter((b) => b.personKey === person.key).flatMap((b) => b.clinics);
  const block = model.clinics.filter((c) => blockClinics.includes(c.name));
  if (block.length) { out.block_budget = rateOf(block); out.block_labor = laborOf(block); }
  out.company_budget = rateOf(model.clinics);
  const cm = (model.company || []).flatMap((h) => h.months).find((x) => x.month === m);
  if (cm && cm.sales) out.company_labor = Math.round((cm.labor / cm.sales) * 1000) / 10;
  for (const k of Object.keys(out)) if (out[k] === null || out[k] === undefined) delete out[k];
  return out;
}

// 直属の上司（評価者）: スタッフ→自院の院長（いなければBM→GM）、院長→BM、BM→GM、GM→管理者
export function superiorOf(model, person) {
  const byGrade = (g) => model.people.filter((p) => p.grade === g);
  const gm = byGrade("G6")[0] || null;
  const bmOf = (clinic) => {
    const b = model.blocks.find((x) => x.clinics.includes(clinic) && x.personKey && x.personKey !== person.key);
    return b ? model.people.find((p) => p.key === b.personKey) : null;
  };
  if (person.grade === "G6") return null;
  if (person.grade === "G5") return gm;
  const clinic = person.clinics[0];
  if (person.grade === "G4") return bmOf(clinic) || gm;
  const manager = byGrade("G4").find((p) => p.clinics.includes(clinic) && p.key !== person.key);
  return manager || bmOf(clinic) || gm;
}

export function canEvaluate(model, viewer, isAdmin, person) {
  if (isAdmin) return true;
  if (!viewer.personKey || viewer.personKey === person.key) return false;
  const sup = superiorOf(model, person);
  if (sup && sup.key === viewer.personKey) return true;
  return viewer.grade === "G6"; // GMは全員を評価できる（上司不在時の代行）
}

// 「評価記録」シート → Map("月|氏名key") → { values, scores, comment, evaluator, updatedAt, rows: {項目ID: 行番号} }
export function parseRecords(rows) {
  const map = new Map();
  if (!rows || !rows.length) return map;
  const head = rows[0].map(normName);
  const c = Object.fromEntries(RECORD_HEADER.map((h) => [h, head.indexOf(normName(h))]));
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const month = String(r[c["対象月"]] ?? "").trim();
    const name = normName(r[c["氏名"]]);
    const id = String(r[c["項目ID"]] ?? "").trim();
    if (!month || !name || !id) continue;
    const key = `${month}|${name}`;
    const rec = map.get(key) || { values: {}, scores: {}, comment: "", evaluator: "", updatedAt: "", rows: {} };
    rec.rows[id] = i + 1;
    const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
    if (id === "_comment") rec.comment = String(r[c["コメント"]] ?? "");
    else if (id === "_total") {
      // 保存した時点の合計点（後で評価項目を変えても過去の点数は変わらない）
      const t = num(r[c["点数"]]);
      rec.storedTotal = t !== null && Number.isFinite(t) ? t : null;
      rec.storedRank = String(r[c["コメント"]] ?? "") || null;
    } else {
      if (String(r[c["区分"]] ?? "") === "数値") { const v = num(r[c["実績値"]]); if (v !== null && Number.isFinite(v)) rec.values[id] = v; }
      else { const s = num(r[c["評価(1-5)"]]); if (s) rec.scores[id] = s; }
    }
    if (r[c["評価者"]]) rec.evaluator = String(r[c["評価者"]]);
    if (r[c["更新日時"]]) rec.updatedAt = String(r[c["更新日時"]]);
    map.set(key, rec);
  }
  return map;
}

// 保存する行を組み立てる（既存の行は行番号つきで上書き、無ければ追記）
export function buildRecordRows({ monthKey, person, items, values, scores, comment, evaluator, now, existing }) {
  const result = scoreMonth(items, values, scores);
  const base = (id, label, kind) => [monthKey, person.name, person.clinics.join("・"), person.grade, id, label, kind];
  const rows = items.map((it, i) => {
    const line = result.lines[i];
    return { id: it.id, values: [...base(it.id, it.label, it.kind), line.value ?? "", line.score ?? "", line.points ?? "", evaluator, now, ""] };
  });
  rows.push({ id: "_total", values: [...base("_total", "月次の点数（獲得点÷満点×100・100点満点）", "合計"), "", "", result.total ?? "", evaluator, now, result.rank || ""] });
  rows.push({ id: "_comment", values: [...base("_comment", "評価者コメント", "コメント"), "", "", "", evaluator, now, comment || ""] });
  const updates = [], appends = [];
  for (const r of rows) {
    const rowNo = existing && existing.rows[r.id];
    if (rowNo) updates.push({ row: rowNo, values: r.values });
    else appends.push(r.values);
  }
  return { updates, appends, result };
}


// ===== クラス順・院長候補 =====

// クラスが高い順（GM → BM → 院長 → 副院長 → 一般 → 新人 → 短時間 → 受付 → その他）
const GRADE_ORDER = ["G6", "G5", "G4", "G3", "G2", "G1", "-S", "-R", "-P"];
export function gradeRank(grade) {
  const i = GRADE_ORDER.indexOf(grade);
  return i < 0 ? GRADE_ORDER.length : i;
}

// 院長候補にできるクラス（院長より下）
export const CANDIDATE_GRADES = ["G3", "G2", "G1", "-S"];

// 「スタッフ設定」シート（台帳）: 氏名ごとの院長候補チェック
export const STAFF_SHEET = "スタッフ設定";
export const STAFF_HEADER = ["氏名", "院長候補", "メモ", "更新者", "更新日時", "部門"];

export function parseStaffSettings(rows) {
  const map = new Map();
  if (!rows || rows.length < 1) return map;
  const head = rows[0].map(normName);
  const c = Object.fromEntries(STAFF_HEADER.map((h) => [h, head.indexOf(normName(h))]));
  map.hasDept = c["部門"] >= 0; // 部門列がある＝画面で担当者を設定済み
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const key = normName(r[c["氏名"]]);
    if (!key) continue;
    const flag = String(r[c["院長候補"]] ?? "").trim();
    map.set(key, {
      row: i + 1,
      candidate: flag === "TRUE" || flag === "true" || /[○◯〇✓✔]|候補/.test(flag),
      memo: String(r[c["メモ"]] ?? ""), by: String(r[c["更新者"]] ?? ""), at: String(r[c["更新日時"]] ?? ""),
      depts: c["部門"] >= 0 ? String(r[c["部門"]] ?? "").split(/[、,，\n]/).map((x) => x.trim()).filter(Boolean) : [],
    });
  }
  return map;
}

// 院長候補を付け外しできる人: 管理者・GM・BM（見えている範囲）・直属の上司。本人は不可
export function canSetCandidate(model, viewer, isAdmin, person) {
  if (!CANDIDATE_GRADES.includes(person.grade)) return false;
  if (isAdmin) return true;
  if (!viewer.personKey || viewer.personKey === person.key) return false;
  if (viewer.grade === "G6" || viewer.grade === "G5") return true;
  const sup = superiorOf(model, person);
  return !!sup && sup.key === viewer.personKey;
}
