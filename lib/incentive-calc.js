// インセンティブ・人件費42%管理の計算ロジック（Googleスプレッドシートの値 → 画面用データ）
//
// 入力はGoogle Sheets API（values:batchGet, UNFORMATTED_VALUE）が返す2次元配列。
// - 進捗売上実績: 「個人」「院」「BM」シート
// - キャリア制度台帳: 「全社方針・人件費42%管理」「月次推移ダッシュボード」「全スタッフ評価詳細」シート
// シートの列位置が多少ずれても動くよう、見出し（「項目」「名前」など）を探して読む。

export const LABOR_CAP_RATE = 0.42;        // 人件費率の上限
export const SOCIAL_INSURANCE_RATE = 0.15; // 法定福利費（支給額に上乗せ）

// 2026年 インセンティブ規定（賞与規定.png）
export const INCENTIVE_RULES = {
  gm: { label: "GM（全社統括）", annual: 1000000, condition: "全社の売上＋営業利益予算達成（年間・決算時）" },
  bm: { label: "BM（エリア統括）", perHalf: 400000, condition: "担当ブロックの売上予算達成（半期ごと）" },
  manager: { label: "院長", perMonth: 50000, condition: "自院の売上予算達成月 × 5万円（半年ごとに精算）" },
  staff: { label: "スタッフ", perHalf: 100000, threshold: 1000000, condition: "半期の月平均個人売上100万円達成" },
};

// スタッフインセンティブの対象等級（院長以上は別枠、アルバイト・受付は対象外）
const STAFF_INCENTIVE_GRADES = ["G1", "G2", "G3", "-S"];

// 台帳（評価シート）に載っていないスタッフの所属院・退職者（台帳に載ればそちらが優先）
export const STAFF_OVERRIDES = {
  clinics: { "谷紫苑": ["茨木"], "橋原沙奈": ["茨木"], "兼若萌々": ["茨木"] },
  retired: ["児玉凪沙"],
};

// 年度は7月始まり。上期=7〜12月、下期=1〜6月
export const FISCAL_MONTHS = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
export const HALVES = [
  { key: "H1", label: "上期（7〜12月）", months: [7, 8, 9, 10, 11, 12] },
  { key: "H2", label: "下期（1〜6月）", months: [1, 2, 3, 4, 5, 6] },
];

const toHalfWidth = (s) => String(s).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

export function normName(s) {
  return String(s ?? "").replace(/[\s　]/g, "");
}

// 「枚方本院」「交野院」「7店舗目（新店）」「本院」などの表記ゆれを統一
export function canonClinic(s) {
  const v = normName(s);
  if (!v) return "";
  if (v.includes("7店舗目") || v.includes("新店") || v.includes("香里園")) return "香里園";
  if (v === "本院" || v.startsWith("枚方")) return "枚方";
  return v.replace(/本院$/, "").replace(/院$/, "");
}

export function parseMonth(label) {
  const m = toHalfWidth(String(label ?? "")).match(/^\s*(\d{1,2})\s*月\s*$/);
  return m ? Number(m[1]) : null;
}

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[¥,円名\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const cell = (rows, r, c) => (rows[r] && rows[r][c] !== undefined ? rows[r][c] : null);

// 見出し行（label を含む行）を探し、月の列番号 {月: 列} を返す（最初の「合計」列まで）
function findMonthHeader(rows, label) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    if (!row.some((v) => normName(v) === label)) continue;
    const cols = {};
    for (let c = 0; c < row.length; c++) {
      const m = parseMonth(row[c]);
      if (m) {
        if (cols[m] === undefined) cols[m] = c;
      }
    }
    if (Object.keys(cols).length) return { row: r, cols };
  }
  return null;
}

// ===== 進捗売上実績 =====

// 「院」シート: 拠点ごとの 予算 / 実績（月別）
export function parseClinicSheet(rows) {
  const header = findMonthHeader(rows, "項目");
  if (!header) throw new Error("「院」シートの見出し行（項目）が見つかりません");
  const clinics = [];
  let current = null;
  for (let r = header.row + 1; r < rows.length; r++) {
    const name = cell(rows, r, 0);
    const item = normName(cell(rows, r, 1));
    if (name && normName(name)) {
      current = { name: canonClinic(name), sheetRow: r + 1, budget: {}, actual: {} };
      clinics.push(current);
    }
    if (!current) continue;
    if (item === "予算" || item === "実績") {
      if (item === "予算") current.budgetRow = r + 1;
      if (item === "実績") current.actualRow = r + 1;
      const target = item === "予算" ? current.budget : current.actual;
      for (const [m, c] of Object.entries(header.cols)) {
        const v = num(cell(rows, r, c));
        if (v !== null) target[m] = v;
      }
    }
  }
  return clinics;
}

// 「個人」シート: 名前ごとの 実績 / 請求金額 / 合計（月別）
export function parsePersonalSheet(rows) {
  let headerRow = -1;
  for (let r = 0; r < rows.length; r++) {
    if (normName(cell(rows, r, 1)) === "名前" && normName(cell(rows, r, 2)) === "項目") { headerRow = r; break; }
  }
  if (headerRow < 0) throw new Error("「個人」シートの見出し行（名前・項目）が見つかりません");
  const cols = {};
  const head = rows[headerRow];
  for (let c = 3; c < head.length; c++) {
    if (normName(head[c]) === "合計") break;
    const m = parseMonth(head[c]);
    if (m) cols[m] = c;
  }
  const people = new Map();
  let current = null;
  for (let r = headerRow + 1; r < rows.length; r++) {
    const name = normName(cell(rows, r, 1));
    if (name) {
      current = people.get(name) || { name: String(cell(rows, r, 1)).trim(), key: name, actual: {}, claim: {}, total: {} };
      people.set(name, current);
    }
    if (!current) continue;
    const item = normName(cell(rows, r, 2));
    const target = item === "実績" ? current.actual : item === "請求金額" ? current.claim : item === "合計" ? current.total : null;
    if (!target) continue;
    for (const [m, c] of Object.entries(cols)) {
      const v = num(cell(rows, r, c));
      if (v !== null) target[m] = v;
    }
  }
  // 個人売上 = 窓口実績 + 保険請求金額（シートの「合計」行と同じ考え方）
  for (const p of people.values()) {
    for (const m of new Set([...Object.keys(p.actual), ...Object.keys(p.claim), ...Object.keys(p.total)])) {
      if (p.total[m] === undefined) p.total[m] = (p.actual[m] || 0) + (p.claim[m] || 0);
    }
  }
  return [...people.values()];
}

// 「BM」シート（数式表示で取得）: BM名と、担当院（数式が参照している「院」シートの行）を読む
export function parseBmSheet(formulaRows, clinics) {
  const byRow = new Map();
  for (const c of clinics) {
    for (const r of [c.sheetRow, c.budgetRow, c.actualRow]) if (r) byRow.set(r, c.name);
  }
  const blocks = [];
  for (let r = 1; r < formulaRows.length; r++) {
    const name = normName(cell(formulaRows, r, 0));
    if (!name) continue;
    const formula = (formulaRows[r] || []).map((v) => String(v ?? "")).join(" ");
    const refs = [...formula.matchAll(/'?院'?!\$?[A-Z]+\$?(\d+)/g)].map((m) => Number(m[1]));
    const clinicNames = [...new Set(refs.map((x) => byRow.get(x)).filter(Boolean))];
    if (clinicNames.length) blocks.push({ bmName: name, clinics: clinicNames });
  }
  return blocks;
}

// ===== キャリア制度台帳 =====

// 「全社方針・人件費42%管理」の各院一覧（店舗名・実績固定人件費）
export function parseFixedLabor(rows) {
  const out = {};
  let nameCol = -1, laborCol = -1, start = -1;
  for (let r = 0; r < rows.length && start < 0; r++) {
    const row = rows[r] || [];
    nameCol = row.findIndex((v) => normName(v) === "店舗名");
    laborCol = row.findIndex((v) => normName(v).startsWith("実績固定人件費"));
    if (nameCol >= 0 && laborCol >= 0) start = r + 1;
  }
  if (start < 0) return out;
  for (let r = start; r < rows.length; r++) {
    const name = cell(rows, r, nameCol);
    if (!name || normName(name).startsWith("全社")) continue;
    const v = num(cell(rows, r, laborCol));
    if (v !== null) out[canonClinic(name)] = v;
  }
  return out;
}

// 「月次推移ダッシュボード」: 月別の支給合計額（社保抜き）
export function parseMonthlyPayroll(rows) {
  const out = {};
  for (const row of rows || []) {
    const m = parseMonth(row && row[0]);
    const v = num(row && row[2]);
    if (m && v !== null) out[m] = v;
  }
  return out;
}

// 「全スタッフ評価詳細」: 所属院・氏名・等級・役職・評価…
export function parseEvaluations(rows) {
  if (!rows || !rows.length) return [];
  const head = rows[0].map(normName);
  const idx = (label) => head.findIndex((h) => h.startsWith(label));
  const col = {
    clinic: idx("所属院"), name: idx("氏名"), grade: idx("等級"), role: idx("役職"),
    score: idx("総合評価点"), rank: idx("評価ランク"), salaryDecision: idx("給与判定"),
    raise: idx("改定額"), newSalary: idx("改定後固定支給額"), positionDecision: idx("役職適格判定"),
    bonus: idx("賞与想定額"), approval: idx("最終決裁"),
  };
  const list = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const name = String(row[col.name] ?? "").trim();
    if (!name) continue;
    const get = (k) => (col[k] >= 0 ? row[col[k]] ?? null : null);
    list.push({
      clinic: canonClinic(get("clinic")), name, key: normName(name), grade: String(get("grade") ?? "").trim(),
      role: String(get("role") ?? "").replace(/（★新設）/, "").trim(),
      score: num(get("score")), rank: get("rank"), salaryDecision: get("salaryDecision"),
      raise: num(get("raise")), newSalary: num(get("newSalary")), positionDecision: get("positionDecision"),
      bonus: num(get("bonus")), approval: get("approval"),
    });
  }
  return list;
}

// ===== 計算 =====

const GRADE_ORDER = ["G6", "G5", "G4", "G3", "G2", "G1", "-S", "-R", "-P"];
const gradeRank = (g) => { const i = GRADE_ORDER.indexOf(g); return i < 0 ? 99 : i; };

// 実績が入っている最新の月（年度順）
export function latestMonthWithData(clinics) {
  let latest = null;
  for (const m of FISCAL_MONTHS) {
    if (clinics.some((c) => c.actual[m] !== undefined && c.actual[m] > 0)) latest = m;
  }
  return latest;
}

const fiscalIndex = (m) => FISCAL_MONTHS.indexOf(Number(m));
const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);

function halfProgress(half, latest) {
  const li = latest ? fiscalIndex(latest) : -1;
  const elapsed = half.months.filter((m) => fiscalIndex(m) <= li);
  return { elapsed, remaining: half.months.length - elapsed.length, complete: elapsed.length === half.months.length };
}

// 院長: 予算達成月 × 5万円
function managerIncentive(clinic, half, prog) {
  const rule = INCENTIVE_RULES.manager;
  const monthly = half.months.map((m) => {
    const budget = clinic.budget[m] ?? null, actual = prog.elapsed.includes(m) ? clinic.actual[m] ?? null : null;
    return { month: m, budget, actual, achieved: budget !== null && actual !== null && budget > 0 && actual >= budget };
  });
  const achievedCount = monthly.filter((x) => x.achieved).length;
  const earned = achievedCount * rule.perMonth;
  return {
    type: "manager", half: half.key, clinic: clinic.name,
    earned, max: earned + prog.remaining * rule.perMonth, projected: earned,
    status: prog.elapsed.length === 0 ? "データ待ち" : prog.complete ? "確定" : "集計中",
    detail: `達成 ${achievedCount}／${prog.elapsed.length}ヶ月（残り${prog.remaining}ヶ月）`, monthly,
  };
}

// 予算に対する累計のペース判定（BM・GM共通）
function paceStatus(cumActual, cumBudget, complete) {
  const achieved = cumBudget > 0 && cumActual >= cumBudget;
  if (complete) return { achieved, status: achieved ? "確定" : "未達確定" };
  return { achieved, status: achieved ? "達成ペース" : "未達ペース" };
}

function bmIncentive(block, clinicsByName, half, prog) {
  const rule = INCENTIVE_RULES.bm;
  const cs = block.clinics.map((n) => clinicsByName.get(n)).filter(Boolean);
  const cumBudget = sum(prog.elapsed.flatMap((m) => cs.map((c) => c.budget[m])));
  const cumActual = sum(prog.elapsed.flatMap((m) => cs.map((c) => c.actual[m])));
  const halfBudget = sum(half.months.flatMap((m) => cs.map((c) => c.budget[m])));
  const { achieved, status } = paceStatus(cumActual, cumBudget, prog.complete);
  return {
    type: "bm", half: half.key, clinics: block.clinics,
    earned: prog.complete && achieved ? rule.perHalf : 0,
    projected: achieved ? rule.perHalf : 0, max: rule.perHalf,
    status: prog.elapsed.length === 0 ? "データ待ち" : status,
    cumBudget, cumActual, halfBudget, rate: cumBudget ? cumActual / cumBudget : null,
    detail: `${block.clinics.join("・")} 累計 ${fmtYen(cumActual)}／予算 ${fmtYen(cumBudget)}`,
  };
}

function staffIncentive(person, half, prog) {
  const rule = INCENTIVE_RULES.staff;
  const values = prog.elapsed.map((m) => person.total[m] ?? 0);
  const total = sum(values);
  const avg = prog.elapsed.length ? total / prog.elapsed.length : null;
  const achieved = avg !== null && avg >= rule.threshold;
  const neededAvg = prog.remaining > 0 ? Math.max(0, (rule.threshold * half.months.length - total) / prog.remaining) : null;
  return {
    type: "staff", half: half.key,
    earned: prog.complete && achieved ? rule.perHalf : 0,
    projected: achieved ? rule.perHalf : 0, max: rule.perHalf,
    status: prog.elapsed.length === 0 ? "データ待ち" : prog.complete ? (achieved ? "確定" : "未達確定") : achieved ? "達成ペース" : "未達ペース",
    avg, total, neededAvg,
    detail: avg === null ? "" : `月平均 ${fmtYen(avg)}${neededAvg !== null && !achieved ? `（残り月平均 ${fmtYen(neededAvg)} で達成）` : ""}`,
  };
}

function gmIncentive(clinics, latest) {
  const rule = INCENTIVE_RULES.gm;
  const li = latest ? fiscalIndex(latest) : -1;
  const elapsed = FISCAL_MONTHS.filter((m) => fiscalIndex(m) <= li);
  const cumBudget = sum(elapsed.flatMap((m) => clinics.map((c) => c.budget[m])));
  const cumActual = sum(elapsed.flatMap((m) => clinics.map((c) => c.actual[m])));
  const annualBudget = sum(FISCAL_MONTHS.flatMap((m) => clinics.map((c) => c.budget[m])));
  const complete = elapsed.length === 12;
  const { achieved, status } = paceStatus(cumActual, cumBudget, complete);
  return {
    type: "gm", half: "H2",
    earned: 0, // 営業利益の達成判定はシートに無いため、確定は決算時に手動で判断
    projected: achieved ? rule.annual : 0, max: rule.annual,
    status: elapsed.length === 0 ? "データ待ち" : status,
    cumBudget, cumActual, annualBudget, rate: cumBudget ? cumActual / cumBudget : null,
    profitCondition: "要確認（営業利益の予算・実績はまだシートに無いため、売上のみで判定しています）",
    detail: `全社売上 累計 ${fmtYen(cumActual)}／予算 ${fmtYen(cumBudget)}`,
  };
}

// 昇格・降格の個人売上チェック（キャリアラダーの数値要件のうち、売上だけ自動判定）
function ladderCheck(person, grade, latest) {
  const li = latest ? fiscalIndex(latest) : -1;
  const months = FISCAL_MONTHS.filter((m) => fiscalIndex(m) <= li);
  const series = months.map((m) => ({ month: m, total: person ? person.total[m] ?? 0 : 0 }));
  const streak = (pred) => { let n = 0; for (let i = series.length - 1; i >= 0 && pred(series[i].total); i--) n++; return n; };
  const items = [];
  if (grade === "G1") {
    const n = series.filter((s) => s.total >= 700000).length;
    items.push({ kind: "promotion", label: "G2昇格：個人売上70万円以上", value: `${n}回達成（今年度）`, ok: n > 0 });
  }
  if (grade === "G2") {
    const n = streak((v) => v >= 1000000);
    items.push({ kind: "promotion", label: "G3昇格：個人売上100万円以上を3ヶ月連続", value: `現在 ${n}ヶ月連続`, ok: n >= 3 });
  }
  if (grade === "G3") {
    const n = streak((v) => v < 650000);
    items.push({ kind: "demotion", label: "降格注意：個人売上65万円未満が3ヶ月連続", value: n ? `現在 ${n}ヶ月連続で65万円未満` : "該当なし", ok: n < 3, warn: n > 0 });
  }
  return { series, items };
}

export function fmtYen(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "-";
  return "¥" + Math.round(v).toLocaleString("ja-JP");
}

// すべてのシートの値から、画面用の全データを組み立てる
export function buildModel(src, today = new Date()) {
  const clinics = parseClinicSheet(src.clinicRows);
  const clinicsByName = new Map(clinics.map((c) => [c.name, c]));
  const personal = parsePersonalSheet(src.personalRows);
  const personalByKey = new Map(personal.map((p) => [p.key, p]));
  const blocks = parseBmSheet(src.bmFormulaRows || [], clinics);
  const fixedLabor = parseFixedLabor(src.policyRows || []);
  const payroll = parseMonthlyPayroll(src.payrollRows || []);
  const evaluations = parseEvaluations(src.evaluationRows || []);
  const latest = latestMonthWithData(clinics);

  // 人の一覧（評価シートの所属院・等級 ＋ 個人売上シート）
  const people = new Map();
  const ensure = (key, name) => {
    if (!people.has(key)) people.set(key, { key, name, clinics: [], grade: "", role: "", evaluations: [] });
    return people.get(key);
  };
  for (const e of evaluations) {
    const p = ensure(e.key, e.name);
    if (e.clinic && !p.clinics.includes(e.clinic)) p.clinics.push(e.clinic);
    if (!p.grade || gradeRank(e.grade) < gradeRank(p.grade)) { p.grade = e.grade; p.role = e.role; }
    p.evaluations.push(e);
  }
  for (const s of personal) ensure(s.key, s.name);
  for (const [key, cs] of Object.entries(STAFF_OVERRIDES.clinics)) {
    const p = people.get(key);
    if (p && !p.clinics.length) p.clinics.push(...cs);
  }
  for (const key of STAFF_OVERRIDES.retired) people.delete(key);
  // BMはシート上「蔡」など名字だけなので、名字が一致する人に結びつける
  for (const b of blocks) {
    const matches = [...people.values()].filter((p) => p.key === b.bmName || p.key.startsWith(b.bmName));
    b.personKey = matches.length === 1 ? matches[0].key : null;
  }

  const fiscalYear = today.getMonth() + 1 >= 7 ? today.getFullYear() : today.getFullYear() - 1;
  const halves = HALVES.map((h) => ({ ...h, ...halfProgress(h, latest) }));

  // 個人ごとのインセンティブ
  for (const p of people.values()) {
    p.incentives = [];
    const sales = personalByKey.get(p.key) || null;
    p.monthlySales = FISCAL_MONTHS.filter((m) => latest && fiscalIndex(m) <= fiscalIndex(latest))
      .map((m) => ({ month: m, total: sales ? sales.total[m] ?? 0 : null }));
    if (p.grade === "G6") p.incentives.push(gmIncentive(clinics, latest));
    // GMはGMインセンティブのみ（BMシートで担当ブロックがあってもBM分は出さない）
    for (const b of blocks.filter((b) => b.personKey === p.key && p.grade !== "G6")) {
      for (const h of halves) p.incentives.push(bmIncentive(b, clinicsByName, h, h));
    }
    if (p.grade === "G4") {
      for (const cn of p.clinics) {
        const c = clinicsByName.get(cn);
        if (c) for (const h of halves) p.incentives.push(managerIncentive(c, h, h));
      }
    }
    if (STAFF_INCENTIVE_GRADES.includes(p.grade) && sales) {
      for (const h of halves) p.incentives.push(staffIncentive(sales, h, h));
    }
    p.ladder = ladderCheck(sales, p.grade, latest);
    p.hasSalesData = !!sales;
  }

  // 院別サマリー
  const clinicSummaries = clinics.map((c) => {
    const fixed = fixedLabor[c.name] ?? null;
    const latestSales = latest ? c.actual[latest] ?? null : null;
    const manager = [...people.values()].find((p) => p.grade === "G4" && p.clinics.includes(c.name));
    const block = blocks.find((b) => b.clinics.includes(c.name));
    return {
      name: c.name,
      manager: manager ? manager.name : null,
      bm: block ? block.bmName : null,
      months: FISCAL_MONTHS.map((m) => ({
        month: m, budget: c.budget[m] ?? null, actual: c.actual[m] ?? null,
        rate: c.budget[m] && c.actual[m] !== undefined ? c.actual[m] / c.budget[m] : null,
      })),
      fixedLabor: fixed,
      laborRate: fixed !== null && latestSales ? fixed / latestSales : null,
      laborCap: latestSales ? latestSales * LABOR_CAP_RATE : null,
    };
  });

  // 全社の人件費42%枠とインセンティブ（半期ごと）
  const fixedTotal = Object.values(fixedLabor).reduce((a, b) => a + b, 0) || null;
  const company = halves.map((h) => {
    const months = h.elapsed.map((m) => {
      const sales = sum(clinics.map((c) => c.actual[m]));
      const paid = payroll[m];
      const labor = paid !== undefined ? paid * (1 + SOCIAL_INSURANCE_RATE) : fixedTotal;
      return { month: m, sales, paid: paid ?? null, labor, laborEstimated: paid === undefined, rate: sales ? labor / sales : null };
    });
    const sales = sum(months.map((x) => x.sales));
    const labor = sum(months.map((x) => x.labor));
    const cap = sales * LABOR_CAP_RATE;
    const room = cap - labor;
    // 半期6ヶ月分に引き延ばした見込み（今のペースが続いた場合）
    const scale = months.length ? h.months.length / months.length : 0;
    const roomProjected = room * scale;
    const items = [...people.values()].flatMap((p) => p.incentives.filter((i) => i.half === h.key).map((i) => ({ ...i, name: p.name })));
    const incentivePaid = sum(items.map((i) => i.projected));
    const incentiveCost = incentivePaid * (1 + SOCIAL_INSURANCE_RATE);
    const payableRatio = incentiveCost > 0 ? Math.max(0, Math.min(1, roomProjected / incentiveCost)) : null;
    return {
      key: h.key, label: h.label, monthsElapsed: months.length, complete: h.complete, months,
      sales, labor, laborRate: sales ? labor / sales : null, cap, room, roomProjected,
      incentivePaid, incentiveCost, payableRatio,
      laborRateWithIncentive: sales && months.length ? (labor + incentiveCost / scale) / sales : null,
    };
  });

  const notes = [];
  if (blocks.some((b) => !b.personKey)) notes.push(`BMシートの名前と一致するスタッフが見つかりません：${blocks.filter((b) => !b.personKey).map((b) => b.bmName).join("、")}`);
  const noClinic = [...people.values()].filter((p) => !p.clinics.length);
  if (noClinic.length) notes.push(`評価シートに所属院が無いスタッフ（インセンティブ対象外として扱っています）：${noClinic.map((p) => p.name).join("、")}`);
  if (company.some((c) => c.months.some((m) => m.laborEstimated))) notes.push("「月次推移ダッシュボード」に支給合計額が無い月は、各院の固定人件費（社保込）の合計で推定しています。支給合計額は画面の「人件費を入力」から登録できます。");

  return {
    fiscalYear, latestMonth: latest, halves: halves.map(({ key, label, months, elapsed, remaining, complete }) => ({ key, label, months, elapsed, remaining, complete })),
    rules: INCENTIVE_RULES, laborCapRate: LABOR_CAP_RATE, socialInsuranceRate: SOCIAL_INSURANCE_RATE,
    clinics: clinicSummaries, blocks: blocks.map(({ bmName, clinics, personKey }) => ({ bmName, clinics, personKey })),
    people: [...people.values()].map(({ key, name, clinics, grade, role, incentives, monthlySales, ladder, evaluations, hasSalesData }) =>
      ({ key, name, clinics, grade, role, incentives, monthlySales, ladder, evaluations, hasSalesData })),
    company, notes,
  };
}

// ===== 閲覧範囲 =====
// admin・GM: 全部 / BM: 担当ブロックの院 / 院長: 自院 / それ以外: 自分だけ
export function resolveViewer(model, staff) {
  if (!staff) return null;
  const isAdmin = staff.role === "admin";
  const key = normName(staff.name);
  let person = key ? model.people.find((p) => p.key === key) : null;
  if (!person && key) {
    const cands = model.people.filter((p) => p.key.startsWith(key));
    if (cands.length === 1) person = cands[0];
  }
  if (isAdmin || (person && person.grade === "G6")) {
    return { name: person ? person.name : staff.name, personKey: person ? person.key : null, scope: "all", clinics: model.clinics.map((c) => c.name) };
  }
  if (!person) return null;
  const block = model.blocks.filter((b) => b.personKey === person.key).flatMap((b) => b.clinics);
  const base = { name: person.name, personKey: person.key, grade: person.grade };
  if (block.length) return { ...base, scope: "block", clinics: [...new Set([...block, ...person.clinics])] };
  if (person.grade === "G4") return { ...base, scope: "clinic", clinics: person.clinics };
  return { ...base, scope: "self", clinics: person.clinics };
}

export function filterModelForViewer(model, viewer) {
  if (viewer.scope === "all") return { ...model, viewer };
  // 自分と、担当院にいる「自分より下の等級」の人だけ（上司・同格の給与や評価は見せない）
  const inScope = (p) => p.key === viewer.personKey ||
    (viewer.scope !== "self" && gradeRank(p.grade) > gradeRank(viewer.grade) && p.clinics.some((c) => viewer.clinics.includes(c)));
  return {
    ...model,
    viewer,
    company: null, // 全社の人件費・インセンティブ総額は全体を見られる人だけ
    clinics: viewer.scope === "self" ? [] : model.clinics.filter((c) => viewer.clinics.includes(c.name)),
    blocks: model.blocks.filter((b) => b.personKey === viewer.personKey),
    // 兼務している人の評価は、担当院の分だけ（本人は全部）
    people: model.people.filter(inScope).map((p) => p.key === viewer.personKey ? p
      : { ...p, evaluations: p.evaluations.filter((e) => viewer.clinics.includes(e.clinic)) }),
    notes: [],
  };
}
