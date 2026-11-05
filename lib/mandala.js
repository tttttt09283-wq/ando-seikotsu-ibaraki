// マンダラチャート（会社・院）／個人KDIの紐づけ／改善アラート
//
// マンダラは 3×3：中心（マス0）＝目標（KGI）、周り（マス1〜8）＝重点の取り組み。
// それぞれのマスに 指標（自動の数字 or 手入力）・目標値 を持てる。周りのマスは月ごとに状態（未着手・取組中・達成）をチェックし、
// そのマスに紐づいた個人KDIの進捗（実績÷目標）を％で見る。
// 保存先は台帳（キャリア制度・人件費42%管理台帳）の「マンダラ」「マンダラ実行」シート。
// 個人KDIは「個人KDI」シートのJ列（マンダラ）に「院名#マス」「会社#マス」で紐づける。


export const COMPANY = "会社";
export const MANDALA_SHEET = "マンダラ";
export const MANDALA_HEADER = ["対象", "年度", "マス", "タイトル", "指標", "目標", "単位", "向き", "担当", "メモ", "更新者", "更新日時"];
export const MANDALA_RUN_SHEET = "マンダラ実行";
export const MANDALA_RUN_HEADER = ["対象", "年度", "マス", "月", "状態", "メモ", "更新者", "更新日時"];
export const STATUSES = ["未着手", "取組中", "達成"];

// 自動で取れる指標（院・会社）
export const CLINIC_METRICS = {
  clinic_budget: { label: "売上予算達成率", unit: "%", direction: "以上" },
  clinic_sales: { label: "売上（院）", unit: "円", direction: "以上" },
  clinic_labor: { label: "人件費率（院）", unit: "%", direction: "以下" },
  clinic_new_count: { label: "新患数", unit: "名", direction: "以上" },
  clinic_new_close: { label: "初回成約率", unit: "%", direction: "以上" },
  clinic_new_continue: { label: "継続率（初回の通院率）", unit: "%", direction: "以上" },
  clinic_patient_care: { label: "患者対応チェック実施率", unit: "%", direction: "以上" },
};
export const COMPANY_METRICS = {
  company_budget: { label: "全社 売上予算達成率", unit: "%", direction: "以上" },
  company_sales: { label: "全社 売上", unit: "円", direction: "以上" },
  company_labor: { label: "全社 人件費率", unit: "%", direction: "以下" },
};

// 3×3の初期値（中身は画面で書き換える）
export function defaultMandala(scope) {
  const company = scope === COMPANY;
  const cells = company
    ? [["全社の目標（KGI）", "company_sales"], ["売上を伸ばす", "company_budget"], ["人件費42%以内", "company_labor"], ["新患を増やす（集客）", ""], ["継続・通院率を上げる", ""], ["人材の採用・育成", ""], ["技術の標準化", ""], ["物販・自費メニュー", ""], ["経費の管理", ""]]
    : [["院の目標（KGI）", "clinic_budget"], ["新患を増やす", "clinic_new_count"], ["初回で信頼をつくる（成約）", "clinic_new_close"], ["継続・通院計画", "clinic_new_continue"], ["患者対応の質", "clinic_patient_care"], ["スタッフの育成", ""], ["人件費のコントロール", "clinic_labor"], ["口コミ・紹介", ""], ["自費・物販の提案", ""]];
  return cells.map(([title, metric], i) => {
    const m = (company ? COMPANY_METRICS : CLINIC_METRICS)[metric];
    return { cell: i, title, metric, target: m ? (m.unit === "%" ? (metric.endsWith("labor") ? 42 : 100) : null) : null, unit: m ? m.unit : "", direction: m ? m.direction : "以上", owner: "", memo: "", isDefault: true };
  });
}

const num = (v) => { if (v === "" || v === null || v === undefined) return null; const n = Number(String(v).replace(/[,%円¥\s]/g, "")); return Number.isFinite(n) ? n : null; };

// 「マンダラ」シート → Map(対象|年度 → [9マス])
export function parseMandala(rows) {
  const map = new Map();
  (rows || []).slice(1).forEach((r, i) => {
    const scope = String((r && r[0]) ?? "").trim(), fy = String((r && r[1]) ?? "").trim();
    const cell = Number((r && r[2]) ?? -1);
    if (!scope || !fy || !(cell >= 0 && cell <= 8)) return;
    const k = `${scope}|${fy}`;
    if (!map.has(k)) map.set(k, defaultMandala(scope).map((c) => ({ ...c, title: "", metric: "", target: null, unit: "", isDefault: false })));
    map.get(k)[cell] = {
      cell, row: i + 2, title: String(r[3] ?? ""), metric: String(r[4] ?? "").trim(), target: num(r[5]), unit: String(r[6] ?? ""),
      direction: String(r[7] ?? "").trim() === "以下" ? "以下" : "以上", owner: String(r[8] ?? ""), memo: String(r[9] ?? ""), by: String(r[10] ?? ""), at: String(r[11] ?? ""), isDefault: false,
    };
  });
  return map;
}
export function mandalaFor(map, scope, fy) {
  return map.get(`${scope}|${fy}`) || defaultMandala(scope);
}
// 「マンダラ実行」シート → Map(対象|年度|マス|月 → {status, memo})
export function parseRuns(rows) {
  const map = new Map();
  (rows || []).slice(1).forEach((r, i) => {
    const [scope, fy, cell, month] = [0, 1, 2, 3].map((j) => String((r && r[j]) ?? "").trim());
    if (!scope || !fy || cell === "" || !month) return;
    map.set(`${scope}|${fy}|${cell}|${month}`, { row: i + 2, status: STATUSES.includes(String(r[4] ?? "")) ? String(r[4]) : "未着手", memo: String(r[5] ?? ""), by: String(r[6] ?? ""), at: String(r[7] ?? "") });
  });
  return map;
}
export function validateCell(raw, scope) {
  const cell = Number(raw.cell);
  if (!(cell >= 0 && cell <= 8)) throw new Error("マスが正しくありません");
  const title = String(raw.title ?? "").trim().slice(0, 40);
  if (!title) throw new Error("タイトルを入れてください");
  const metrics = scope === COMPANY ? COMPANY_METRICS : CLINIC_METRICS;
  const metric = metrics[raw.metric] ? raw.metric : "";
  const target = raw.target === "" || raw.target === null || raw.target === undefined ? null : num(raw.target);
  if (raw.target !== "" && raw.target !== null && raw.target !== undefined && target === null) throw new Error("目標は数字で入れてください");
  return {
    cell, title, metric, target,
    unit: metric ? metrics[metric].unit : String(raw.unit ?? "").trim().slice(0, 6),
    direction: metric ? metrics[metric].direction : raw.direction === "以下" ? "以下" : "以上",
    owner: String(raw.owner ?? "").trim().slice(0, 40), memo: String(raw.memo ?? "").trim().slice(0, 300),
  };
}

// 達成率（％）。「以上」は 実績÷目標、「以下」は 目標÷実績（目標以下なら100%）
export function achievement(value, target, direction) {
  if (value === null || value === undefined || !Number.isFinite(value) || !target) return null;
  const r = direction === "以下" ? (value <= target ? 1 : target / value) : value / target;
  return Math.round(r * 1000) / 10;
}

// "YYYY-MM" → 年度内の月番号（7月はじまり）と年度
export function fiscalOf(monthKey) {
  const [y, m] = String(monthKey).split("-").map(Number);
  return { month: m, fiscalYear: m >= 7 ? y : y - 1 };
}

// 会社の月の数字（売上・人件費は台帳から）
export function companyNumbers(model, monthKey) {
  const { month, fiscalYear } = fiscalOf(monthKey);
  const inYear = fiscalYear === model.fiscalYear;
  const cm = inYear ? (model.company || []).flatMap((h) => h.months).find((x) => x.month === month) : null;
  const budget = inYear ? model.clinics.reduce((a, c) => { const x = c.months.find((mm) => mm.month === month); return a + (x && x.actual != null ? x.budget || 0 : 0); }, 0) : 0;
  const sales = cm ? cm.sales : null;
  const labor = cm ? Math.round(cm.labor) : null;
  return {
    month: monthKey, sales, budget: budget || null, labor,
    values: {
      company_sales: sales, company_budget: sales && budget ? Math.round((sales / budget) * 1000) / 10 : null,
      company_labor: sales && labor !== null ? Math.round((labor / sales) * 1000) / 10 : null,
    },
  };
}
// 院の月の数字（autoValues の院の部分と同じ計算）
export function clinicValues(model, np, clinic, monthKey, autoValues) {
  const fake = { key: `__clinic__${clinic}`, name: clinic, clinics: [clinic], grade: "", monthlySales: [] };
  const auto = autoValues(model, fake, monthKey, np) || {};
  const { month, fiscalYear } = fiscalOf(monthKey);
  const c = fiscalYear === model.fiscalYear ? model.clinics.find((x) => x.name === clinic) : null;
  const m = c && c.months.find((x) => x.month === month);
  return {
    clinic_budget: auto.clinic_budget ?? null, clinic_sales: m && m.actual != null ? m.actual : null, clinic_labor: auto.clinic_labor ?? null,
    clinic_new_count: auto.clinic_new_count ?? null, clinic_new_close: auto.clinic_new_close ?? null,
    clinic_new_continue: auto.clinic_new_continue ?? null, clinic_patient_care: auto.clinic_patient_care ?? null,
  };
}

// ===== マンダラ＋KDIの進捗＋アラート =====
// kdiLinks: [{personKey, name, kdi:{id,label,target,unit,direction,mandala}, actual}]
export function buildChart({ scope, fy, cells, runs, values, monthKey, kdiLinks }) {
  const out = cells.map((c) => {
    const value = c.metric ? values[c.metric] ?? null : null;
    const ach = c.metric ? achievement(value, c.target, c.direction) : null;
    const linked = kdiLinks.filter((l) => l.kdi.mandala === `${scope}#${c.cell}`).map((l) => ({
      personKey: l.personKey, name: l.name, kdiId: l.kdi.id, label: l.kdi.label, target: l.kdi.target, unit: l.kdi.unit, actual: l.actual ?? null,
      rate: achievement(l.actual ?? null, l.kdi.target, l.kdi.direction),
    }));
    const rated = linked.filter((l) => l.rate !== null);
    const kdiRate = rated.length ? Math.round((rated.reduce((a, l) => a + Math.min(l.rate, 150), 0) / rated.length) * 10) / 10 : null;
    const run = runs.get(`${scope}|${fy}|${c.cell}|${monthKey}`);
    return { ...c, value, achievement: ach, kdi: linked, kdiRate, status: run ? run.status : "未着手", statusMemo: run ? run.memo : "" };
  });
  return { scope, fy, cells: out, alerts: alertsFor(scope, out) };
}
// 改善アラート
//  ・KDIは達成（平均100%以上）なのに、そのマスの数字（または中心のKGI）が未達 → 行動の中身を見直す
//  ・周りのマスに、紐づいたKDIが1つも無い → 行動が個人のKDIに落ちていない
export function alertsFor(scope, cells) {
  const alerts = [];
  const center = cells[0];
  const kgiMissed = center.achievement !== null && center.achievement < 100;
  for (const c of cells.slice(1)) {
    if (!c.title) continue;
    if (!c.kdi.length) alerts.push({ type: "unlinked", level: "warn", cell: c.cell, text: `「${c.title}」に紐づいた個人KDIがありません。誰が・何回やるのかをKDIにして紐づけてください` });
    else if (c.kdiRate !== null && c.kdiRate >= 100) {
      const own = c.achievement !== null && c.achievement < 100;
      if (own || kgiMissed) {
        const what = own ? `「${c.title}」の数字（${c.achievement}%）` : `${scope === COMPANY ? "会社" : "院"}の目標（KGI ${center.achievement}%）`;
        alerts.push({ type: "mismatch", level: "ng", cell: c.cell, text: `「${c.title}」のKDIは達成（${c.kdiRate}%）なのに、${what}が未達です。行動の中身・やり方がKGIに効いていない可能性があります。KDIの内容を見直してください` });
      }
    }
  }
  return alerts;
}
// どのマンダラにも紐づいていない個人KDI
export function unlinkedKdiAlerts(kdiLinks) {
  const byPerson = new Map();
  for (const l of kdiLinks.filter((x) => !x.kdi.mandala)) {
    if (!byPerson.has(l.personKey)) byPerson.set(l.personKey, { name: l.name, clinics: l.clinics || [], labels: [] });
    byPerson.get(l.personKey).labels.push(l.kdi.label);
  }
  return [...byPerson].map(([personKey, e]) => ({
    type: "kdi_unlinked", level: "warn", personKey, clinics: e.clinics,
    text: `${e.name}さんのKDI ${e.labels.length}件（${e.labels.join("・")}）が、どのマンダラのマスにも紐づいていません`,
  }));
}

