// 等級別の月次評価（数値＋行動・100点満点）
//
// - 評価項目は台帳の「評価項目」シートで管理（無ければ下の既定値）。配点の合計が100でなくても100点満点に換算する
// - 評価結果は台帳の「評価記録」シートに1項目1行で保存（月・氏名・項目ID が同じ行は上書き）
// - 数値項目のうち売上・予算達成率・人件費率は進捗売上実績／台帳から自動で入る。それ以外は評価者が入力
// - 行動項目は直属の上司が5段階で採点（点数 = 配点 × 評価 / 5）

import { normName } from "./incentive-calc.js";

export const ITEM_SHEET = "評価項目";
export const RECORD_SHEET = "評価記録";
export const ITEM_HEADER = ["等級", "区分", "項目ID", "項目名", "配点", "目標値", "単位", "方向", "自動", "必須", "採点基準・説明"];
export const RECORD_HEADER = ["対象月", "氏名", "所属院", "等級", "項目ID", "項目名", "区分", "実績値", "評価(1-5)", "点数", "評価者", "更新日時", "コメント"];

// 自動で入る数値（auto の値）
//   personal_sales: 個人売上（窓口＋保険請求） / clinic_budget: 自院の売上予算達成率(%)
//   clinic_labor: 自院の人件費率(%) / block_budget・block_labor: 担当ブロック / company_budget・company_labor: 全社
const N = (id, label, points, target, unit, extra = {}) => ({ kind: "数値", id, label, points, target, unit, direction: "以上", auto: "", required: false, note: "", ...extra });
const B = (id, label, points, note, extra = {}) => ({ kind: "行動", id, label, points, target: null, unit: "", direction: "", auto: "", required: false, note, ...extra });

export const DEFAULT_ITEMS = {
  G1: [
    N("personal_sales", "個人売上", 10, 700000, "円", { auto: "personal_sales" }),
    N("new_count", "新規対応数", 5, 3, "名"),
    N("new_close", "新規成約率", 10, 50, "%"),
    N("on_time", "施術枠内時間の遵守率", 10, 90, "%"),
    N("reviews", "口コミ獲得数", 5, 1, "件"),
    B("greeting", "挨拶・身だしなみ", 10, "明るい挨拶、清潔な身だしなみを毎日できているか"),
    B("punctual", "時間厳守・無遅刻無欠勤", 10, "遅刻・欠勤なし、施術時間を守れているか"),
    B("coachable", "指導の受け入れ・改善", 10, "指導を素直に受け止め、次回までに改善できているか"),
    B("skill_check", "社内実技チェックの進捗", 10, "研修・実技チェックを計画どおり合格しているか"),
    B("cleanliness", "院内美化", 5, "ベッド・待合室・トイレの清掃と整頓"),
    B("philosophy", "理念の理解・体現", 10, "理念に沿った患者対応ができているか"),
    B("pc", "PCスキル", 5, "予約システムの操作・カルテ入力を一人でできる"),
  ],
  G2: [
    N("personal_sales", "個人売上", 15, 700000, "円", { auto: "personal_sales" }),
    N("next_rate", "次回予約率", 10, 75, "%"),
    N("new_count", "新規対応数", 5, 6, "名"),
    N("new_close", "新規成約率", 10, 60, "%"),
    N("new_sales", "新規売上", 5, 100000, "円"),
    N("reviews", "口コミ獲得数", 5, 3, "件"),
    B("hourensou", "報連相の徹底", 10, "院長への報告・連絡・相談がタイムリーか"),
    B("cleanliness", "院内美化", 5, "清掃・整頓を自分から行っているか"),
    B("self_pay", "自費メニューの提案", 10, "症状に合わせて自費を提案し定着させているか"),
    B("technique", "基本手技の単独完結", 10, "基本手技を一人で最後までできるか"),
    B("philosophy", "理念の理解・体現", 5, "理念に沿った患者対応ができているか"),
    B("pc", "PCスキル", 10, "予約・カルテ・日計表を正確に入力できる"),
  ],
  G3: [
    N("personal_sales", "個人売上", 20, 1000000, "円", { auto: "personal_sales" }),
    N("new_close", "新規成約率", 10, 70, "%"),
    N("new_sales", "新規売上", 10, 150000, "円"),
    N("new_count", "新規対応数", 5, 8, "名"),
    N("next_rate", "次回予約率", 10, 75, "%"),
    N("reviews", "口コミ獲得数", 5, 3, "件"),
    B("acting_manager", "院長不在時の代行業務", 10, "院長不在時に受付・スタッフ配置・トラブル対応を任せられるか"),
    B("mentor", "新人の実技メンター", 10, "新人1名の実技指導を計画的に行っているか"),
    B("full_menu", "自費フルメニュー施術・問診成約", 10, "自費メニューを全て施術でき、問診からの成約率が高いか"),
    B("pc", "PCスキル", 10, "日計表・売上集計をスプレッドシートで作成・更新できる"),
  ],
  G4: [
    N("clinic_budget", "自院 売上予算達成率", 20, 100, "%", { auto: "clinic_budget" }),
    N("clinic_labor", "自院 人件費率", 15, 42, "%", { auto: "clinic_labor", direction: "以下" }),
    N("new_close", "新規成約率", 10, 70, "%"),
    N("new_sales", "新規売上", 10, 200000, "円"),
    N("next_rate", "院全体の次回予約率", 5, 75, "%"),
    B("pl", "店舗PL管理・予実管理", 10, "売上・経費・人件費の予実を毎月把握し対策を打てているか"),
    B("shift", "シフト管理・人件費コントロール", 5, "売上に合わせた人員配置ができているか"),
    B("claim", "クレームの一次完結", 5, "クレームを院内で解決し再発防止できているか"),
    B("develop", "部下育成（面談・技術指導）", 10, "月1回の面談と技術指導を行っているか"),
    B("pc", "PC業務（必須）", 10, "PL・シフト・予実表をスプレッドシートで自分で作成・更新できる", { required: true }),
  ],
  G5: [
    N("block_budget", "ブロック 売上予算達成率", 30, 100, "%", { auto: "block_budget" }),
    N("block_labor", "ブロック 人件費率", 20, 42, "%", { auto: "block_labor", direction: "以下" }),
    N("turnover", "エリア離職率", 10, 10, "%", { direction: "以下" }),
    N("new_close", "新規成約率", 10, 80, "%"),
    B("hiring", "採用面接・人員計画", 10, "採用面接を行い、必要人員を計画的に確保できているか"),
    B("coaching", "院長への予実管理指導", 5, "担当院長の予実管理を毎月レビューしているか"),
    B("tech_review", "技術審査・難治症状指導", 5, "技術審査員として指導できているか"),
    B("pc", "PC業務（必須）", 10, "エリアの予実・人件費データを分析し、資料にまとめられる", { required: true }),
  ],
  G6: [
    N("company_budget", "全社 売上予算達成率", 30, 100, "%", { auto: "company_budget" }),
    N("company_labor", "全社 人件費率", 20, 42, "%", { auto: "company_labor", direction: "以下" }),
    N("profit_rate", "全社 営業利益達成率", 20, 95, "%"),
    B("develop_leaders", "BM・院長の育成", 10, "次期BM・院長を計画的に育成しているか（年2名）"),
    B("strategy", "出店戦略・新業態", 5, "出店・新業態の計画を進めているか"),
    B("standardize", "技術開発・標準化", 5, "全社の技術を標準化し、マニュアル化しているか"),
    B("pc", "PC業務（必須）", 10, "全社KPIダッシュボード・経営資料を作成し、会議を運営できる", { required: true }),
  ],
  "-S": [
    N("slot_fill", "担当枠充足率", 20, 80, "%"),
    N("next_rate", "次回予約率", 15, 70, "%"),
    N("new_close", "新規成約率", 10, 50, "%"),
    N("new_count", "新規対応数", 5, 3, "名"),
    B("technique", "G2同等の手技維持", 15, "G2と同じ水準の手技を維持しているか"),
    B("teamwork", "時間内の業務完結・チーム連携", 15, "限られた時間で業務を終え、引き継ぎができているか"),
    B("hourensou", "報連相の徹底", 10, "院長への報告・連絡・相談がタイムリーか"),
    B("pc", "PCスキル", 10, "予約システムの操作・カルテ入力を一人でできる"),
  ],
  "-R": [
    N("next_guide", "次回予約誘導率", 20, 70, "%"),
    N("retail", "物販成約数", 15, 10, "件"),
    N("reviews", "口コミ獲得数", 15, 5, "件"),
    B("reception", "電話・対面の接遇", 15, "明るく丁寧な電話・受付対応ができているか"),
    B("waiting", "待合室美化・カルテ管理", 10, "待合室の整頓とカルテの管理"),
    B("receipt", "レセプト点検", 10, "レセプト・請求の不備がないか"),
    B("pc", "PCスキル", 15, "予約システム・日計表入力・レセプト点検をPCで正確にできる"),
  ],
};

export const EVALUATED_GRADES = Object.keys(DEFAULT_ITEMS);
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
    const kind = String(r[c["区分"]] ?? "").trim() === "数値" ? "数値" : "行動";
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

// 1人・1か月の採点（values: 数値の実績、scores: 行動の5段階）
export function scoreMonth(items, values, scores) {
  const totalPoints = items.reduce((a, it) => a + it.points, 0) || 100;
  let earned = 0, filled = 0;
  const lines = items.map((it) => {
    const v = it.kind === "数値" ? values[it.id] ?? null : null;
    const s = it.kind === "行動" ? scores[it.id] ?? null : null;
    const pts = it.kind === "数値" ? numberPoints(it, v) : behaviorPoints(it, s);
    if (pts !== null) { earned += pts; filled++; }
    return { id: it.id, value: v, score: s, points: pts === null ? null : Math.round(pts * 10) / 10 };
  });
  const complete = filled === items.length;
  const total = filled ? Math.round((earned / totalPoints) * 1000) / 10 : null;
  const sub = (kind) => {
    const its = items.filter((it) => it.kind === kind);
    const max = its.reduce((a, it) => a + it.points, 0);
    const got = lines.filter((l, i) => items[i].kind === kind && l.points !== null).reduce((a, l) => a + l.points, 0);
    return { max: Math.round((max / totalPoints) * 1000) / 10, earned: Math.round((got / totalPoints) * 1000) / 10 };
  };
  const requiredMissed = items.filter((it) => it.required && it.kind === "行動" && scores[it.id] && scores[it.id] < PC_REQUIRED_MIN).map((it) => it.label);
  return { lines, total, rank: complete ? rankOf(total) : null, complete, filled, count: items.length, numbers: sub("数値"), behaviors: sub("行動"), requiredMissed };
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
export function autoValues(model, person, monthKey) {
  const p = parseMonthKey(monthKey);
  const out = {};
  if (!p || p.fiscalYear !== model.fiscalYear) return out; // シートは今年度分だけ
  const m = p.month;
  const ms = person.monthlySales && person.monthlySales.find((x) => x.month === m);
  if (ms && ms.total !== null) out.personal_sales = Math.round(ms.total);

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
    else if (id !== "_total") {
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
  rows.push({ id: "_total", values: [...base("_total", "合計（100点換算）", "合計"), "", "", result.total ?? "", evaluator, now, result.rank || ""] });
  rows.push({ id: "_comment", values: [...base("_comment", "評価者コメント", "コメント"), "", "", "", evaluator, now, comment || ""] });
  const updates = [], appends = [];
  for (const r of rows) {
    const rowNo = existing && existing.rows[r.id];
    if (rowNo) updates.push({ row: rowNo, values: r.values });
    else appends.push(r.values);
  }
  return { updates, appends, result };
}

