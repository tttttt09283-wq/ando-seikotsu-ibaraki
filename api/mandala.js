// Vercel Serverless Function: /api/mandala
// 会社・院のマンダラチャート（3×3）、個人KDIの紐づけ、経理（経費と営業利益）、改善アラート。
// データは台帳（キャリア制度・人件費42%管理台帳）に保存し、個人KDIは /incentive の月次評価と同じ「個人KDI」シートを使う。
//
//   GET  ?month=YYYY-MM                                   … 見てよい範囲のマンダラ・KDI・アラート（経理は社長・GMのみ）
//   POST { action: "saveCell", scope, cell, title, metric, target, unit, direction, owner, memo }  … マスの編集
//   POST { action: "setStatus", scope, cell, month, status, memo }                                  … 月のチェック
//   POST { action: "linkKdi", personKey, kdiId, mandala }                                            … KDIをマスに紐づけ
//   POST { action: "saveExpenses", month, expenses, memo }                                           … 経理（社長・GM）
//
// 編集できる人：会社＝社長・GM／院＝その院の院長・管轄のBM・社長・GM／KDI＝直属の上司・社長・GM

import { batchGet, batchUpdate, getSheetTitles, addSheets, appendRows } from "../lib/google-sheets.js";
import { resolveViewer, filterModelForViewer, canSeeLabor, normName, clinicsAt, evalGradeAt } from "../lib/incentive-calc.js";
import { CAREER_SHEET_ID, loadModel, loadNewPatients, authenticate, viewerNotFound } from "../lib/incentive-data.js";
import { RECORD_SHEET, parseRecords, autoValues, canEvaluate, parseMonthKey, monthKeyOf } from "../lib/evaluation.js";
import { TRACK_SHEET, KDI_SHEET, KDI_HEADER, parseTracks, parseKdi, kdiFor, trackGradeFor } from "../lib/career-track.js";
import {
  COMPANY, MANDALA_SHEET, MANDALA_HEADER, MANDALA_RUN_SHEET, MANDALA_RUN_HEADER, STATUSES, CLINIC_METRICS, COMPANY_METRICS,
  ACCOUNTING_SHEET, ACCOUNTING_HEADER, EXPENSE_ITEMS,
  parseMandala, mandalaFor, parseRuns, validateCell, parseAccounting, validateExpenses, fiscalOf,
  companyNumbers, clinicValues, buildChart, unlinkedKdiAlerts,
} from "../lib/mandala.js";

const nowJst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16);
const colOf = (n) => String.fromCharCode(64 + n);

async function loadSheets() {
  const titles = await getSheetTitles(CAREER_SHEET_ID);
  const want = [
    [MANDALA_SHEET, "A1:L2000"], [MANDALA_RUN_SHEET, "A1:H20000"], [ACCOUNTING_SHEET, `A1:${colOf(ACCOUNTING_HEADER.length)}200`],
    [KDI_SHEET, "A1:J3000"], [RECORD_SHEET, "A1:M20000"], [TRACK_SHEET, "A1:E1000"],
  ];
  const have = want.filter(([t]) => titles.includes(t));
  const got = have.length ? await batchGet(CAREER_SHEET_ID, have.map(([t, r]) => `'${t}'!${r}`)) : [];
  const rows = Object.fromEntries(have.map(([t], i) => [t, got[i] || []]));
  return {
    titles,
    mandala: parseMandala(rows[MANDALA_SHEET]), runs: parseRuns(rows[MANDALA_RUN_SHEET]),
    accounting: parseAccounting(rows[ACCOUNTING_SHEET]),
    kdi: parseKdi(rows[KDI_SHEET]), kdiRaw: rows[KDI_SHEET] || [],
    records: parseRecords(rows[RECORD_SHEET]), tracks: parseTracks(rows[TRACK_SHEET]),
  };
}

const isTop = (viewer) => viewer.scope === "all"; // 社長・GM
function canEditScope(viewer, scope) {
  if (isTop(viewer)) return true;
  if (scope === COMPANY) return false;
  return (viewer.grade === "G4" || viewer.grade === "G5") && (viewer.clinics || []).includes(scope);
}
function canEditKdi(model, viewer, isAdmin, person, monthKey) {
  if (isTop(viewer)) return true;
  return canEvaluate(model, viewer, isAdmin, { ...person, clinics: clinicsAt(person, monthKey), grade: evalGradeAt(person, monthKey) });
}
function gradeFor(sheets, person, monthKey) {
  const t = sheets.tracks.get(person.key);
  return trackGradeFor(evalGradeAt(person, monthKey), t ? t.track : "management");
}

function buildPayload({ model, np, viewer, isAdmin, sheets, monthKey }) {
  const { fiscalYear } = fiscalOf(monthKey);
  const fy = String(fiscalYear);
  const top = isTop(viewer);
  const visiblePeople = filterModelForViewer(model, viewer).people.map((vp) => model.people.find((p) => p.key === vp.key)).filter(Boolean);
  // 人ごとのKDI（紐づけ・今月の実績）。実績は /incentive の月次評価で入れた値
  const kdiLinksAll = model.people.filter((p) => p.grade && !/^-P/.test(p.grade)).flatMap((p) => {
    const rec = sheets.records.get(`${monthKey}|${p.key}`);
    return kdiFor(sheets.kdi, p.key, gradeFor(sheets, p, monthKey)).items.map((k) => ({
      personKey: p.key, name: p.name, clinics: clinicsAt(p, monthKey), kdi: k, actual: rec && rec.values[k.id] !== undefined ? rec.values[k.id] : null,
    }));
  });
  const company = companyNumbers(model, sheets.accounting, monthKey);
  const charts = [];
  // 会社のマンダラ：数字（KGI）は社長・GMだけ
  const cChart = buildChart({ scope: COMPANY, fy, cells: mandalaFor(sheets.mandala, COMPANY, fy), runs: sheets.runs, values: top ? company.values : {}, monthKey, kdiLinks: kdiLinksAll });
  charts.push({ ...cChart, label: "会社", canEdit: canEditScope(viewer, COMPANY), showNumbers: top, metrics: COMPANY_METRICS });
  for (const clinic of (top ? model.clinics.map((c) => c.name) : viewer.clinics || [])) {
    const showNumbers = canSeeLabor(viewer);
    const values = showNumbers ? clinicValues(model, np, clinic, monthKey, autoValues) : {};
    const ch = buildChart({ scope: clinic, fy, cells: mandalaFor(sheets.mandala, clinic, fy), runs: sheets.runs, values, monthKey, kdiLinks: kdiLinksAll });
    charts.push({ ...ch, label: clinic, canEdit: canEditScope(viewer, clinic), showNumbers, metrics: CLINIC_METRICS });
  }
  // 見えている人のKDI（スタッフは自分だけ）
  const people = visiblePeople.filter((p) => p.grade && !/^-P/.test(p.grade)).map((p) => ({
    key: p.key, name: p.name, grade: p.grade, clinics: clinicsAt(p, monthKey),
    canEdit: canEditKdi(model, viewer, isAdmin, p, monthKey),
    kdi: kdiLinksAll.filter((l) => l.personKey === p.key).map((l) => ({ id: l.kdi.id, label: l.kdi.label, target: l.kdi.target, unit: l.kdi.unit, direction: l.kdi.direction, mandala: l.kdi.mandala, actual: l.actual })),
  }));
  const visibleKeys = new Set(people.map((p) => p.key));
  const alerts = [
    ...charts.flatMap((c) => c.alerts.map((a) => ({ ...a, scope: c.scope, label: c.label }))),
    ...unlinkedKdiAlerts(kdiLinksAll.filter((l) => visibleKeys.has(l.personKey))),
  ];
  // 経理：年度の月ごとの数字（社長・GMだけ）
  let accounting = null;
  if (top) {
    const months = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6].map((m) => `${m >= 7 ? fiscalYear : fiscalYear + 1}-${String(m).padStart(2, "0")}`);
    accounting = { items: EXPENSE_ITEMS.map(([key, label]) => ({ key, label })), months: months.map((k) => companyNumbers(model, sheets.accounting, k)) };
  }
  return {
    month: monthKey, fiscalYear, viewer, isTop: top, statuses: STATUSES,
    charts, people, alerts, accounting, company: top ? company : null,
    mandalaOptions: charts.map((c) => ({ scope: c.scope, label: c.label, cells: c.cells.slice(1).map((x) => ({ cell: x.cell, title: x.title })) })),
  };
}

// ===== 書き込み =====
async function ensureSheet(sheets, title, header) {
  if (sheets.titles.includes(title)) return;
  await addSheets(CAREER_SHEET_ID, [title]);
  await batchUpdate(CAREER_SHEET_ID, [{ range: `'${title}'!A1:${colOf(header.length)}1`, values: [header] }], "RAW");
  sheets.titles.push(title);
}
async function saveCell({ viewer, sheets, body, monthKey, by }) {
  const scope = String(body.scope || "");
  if (!canEditScope(viewer, scope)) throw new Error(scope === COMPANY ? "会社のマンダラを編集できるのは社長・GMです" : "院のマンダラを編集できるのは、その院の院長・BM・社長・GMです");
  const c = validateCell(body, scope);
  const fy = String(fiscalOf(monthKey).fiscalYear);
  await ensureSheet(sheets, MANDALA_SHEET, MANDALA_HEADER);
  const existing = sheets.mandala.get(`${scope}|${fy}`);
  const row = [scope, fy, c.cell, c.title, c.metric, c.target ?? "", c.unit, c.direction, c.owner, c.memo, by, nowJst()];
  const cur = existing && existing[c.cell] && existing[c.cell].row;
  if (cur) { await batchUpdate(CAREER_SHEET_ID, [{ range: `'${MANDALA_SHEET}'!A${cur}:L${cur}`, values: [row] }], "RAW"); return; }
  // その対象・年度の最初の保存なら、初期値の9マスもまとめて保存する（画面で見ていたものがそのまま残るように）
  const rows = existing ? [row] : mandalaFor(sheets.mandala, scope, fy).map((d) => d.cell === c.cell ? row
    : [scope, fy, d.cell, d.title, d.metric, d.target ?? "", d.unit, d.direction, d.owner, d.memo, by, nowJst()]);
  await appendRows(CAREER_SHEET_ID, `'${MANDALA_SHEET}'!A:L`, rows);
}
async function setStatus({ viewer, sheets, body, monthKey, by }) {
  const scope = String(body.scope || "");
  if (!canEditScope(viewer, scope)) throw new Error("このマンダラのチェックはできません");
  const cell = Number(body.cell);
  if (!(cell >= 1 && cell <= 8)) throw new Error("マスが正しくありません");
  if (!STATUSES.includes(body.status)) throw new Error("状態が正しくありません");
  const fy = String(fiscalOf(monthKey).fiscalYear);
  await ensureSheet(sheets, MANDALA_RUN_SHEET, MANDALA_RUN_HEADER);
  const row = [scope, fy, cell, monthKey, body.status, String(body.memo || "").slice(0, 300), by, nowJst()];
  const cur = sheets.runs.get(`${scope}|${fy}|${cell}|${monthKey}`);
  if (cur) await batchUpdate(CAREER_SHEET_ID, [{ range: `'${MANDALA_RUN_SHEET}'!A${cur.row}:H${cur.row}`, values: [row] }], "RAW");
  else await appendRows(CAREER_SHEET_ID, `'${MANDALA_RUN_SHEET}'!A:H`, [row]);
}
async function linkKdi({ model, viewer, isAdmin, sheets, body, monthKey, by }) {
  const person = model.people.find((p) => p.key === normName(body.personKey));
  if (!person) throw new Error("スタッフが見つかりません");
  if (!canEditKdi(model, viewer, isAdmin, person, monthKey)) throw new Error("KDIを紐づけられるのは直属の上司・社長・GMです");
  const mandala = String(body.mandala || "");
  if (mandala && !/^[^#]{1,20}#[1-8]$/.test(mandala)) throw new Error("マンダラのマスが正しくありません");
  const own = kdiFor(sheets.kdi, person.key, gradeFor(sheets, person, monthKey));
  if (!own.items.some((k) => k.id === body.kdiId)) throw new Error("KDIが見つかりません");
  // この人のKDIを（標準KDIのままなら個人用にして）書き直す
  const list = own.items.map((k) => (k.id === body.kdiId ? { ...k, mandala } : k));
  await ensureSheet(sheets, KDI_SHEET, KDI_HEADER);
  const keep = sheets.kdiRaw.slice(1).filter((r) => r && r[0] && normName(r[0]) !== person.key);
  const rows = [KDI_HEADER, ...keep.map((r) => KDI_HEADER.map((_, i) => r[i] ?? "")),
    ...list.map((k) => [person.key, person.name, k.id, k.label, k.target, k.unit, k.direction, by, nowJst(), k.mandala || ""])];
  while (rows.length < sheets.kdiRaw.length) rows.push(Array(KDI_HEADER.length).fill(""));
  await batchUpdate(CAREER_SHEET_ID, [{ range: `'${KDI_SHEET}'!A1:J${rows.length}`, values: rows }], "RAW");
}
async function saveExpenses({ viewer, sheets, body, by }) {
  if (!isTop(viewer)) throw new Error("経理の入力は社長・GMのみです");
  const month = String(body.expMonth || body.month || ""); // 入力する月（画面で見ている月とは別）
  if (!parseMonthKey(month)) throw new Error("月が正しくありません");
  const e = validateExpenses(body.expenses);
  await ensureSheet(sheets, ACCOUNTING_SHEET, ACCOUNTING_HEADER);
  const row = [month, ...EXPENSE_ITEMS.map(([k]) => e[k]), String(body.memo || "").slice(0, 300), by, nowJst()];
  const cur = sheets.accounting.get(month);
  const end = colOf(ACCOUNTING_HEADER.length);
  if (cur) await batchUpdate(CAREER_SHEET_ID, [{ range: `'${ACCOUNTING_SHEET}'!A${cur.row}:${end}${cur.row}`, values: [row] }], "RAW");
  else await appendRows(CAREER_SHEET_ID, `'${ACCOUNTING_SHEET}'!A:${end}`, [row]);
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") { res.status(405).json({ error: "GET・POSTのみ対応しています" }); return; }
  const staff = await authenticate(req, res);
  if (!staff) return;
  const isAdmin = staff.role === "admin";
  let model, np;
  try {
    model = await loadModel(req.query && req.query.refresh === "1");
    np = await loadNewPatients(model, req.query && req.query.refresh === "1");
  } catch (e) { res.status(500).json({ error: e.message || String(e) }); return; }
  const viewer = resolveViewer(model, staff);
  if (!viewer) return viewerNotFound(res, staff);
  const body = req.body || {};
  let monthKey = (req.method === "POST" ? body.month : req.query && req.query.month) || monthKeyOf(new Date(Date.now() + 9 * 3600 * 1000));
  if (!parseMonthKey(monthKey)) monthKey = monthKeyOf(new Date(Date.now() + 9 * 3600 * 1000));
  try {
    let sheets = await loadSheets();
    if (req.method === "POST") {
      const by = viewer.name || staff.name || "管理者";
      const ctx = { model, viewer, isAdmin, sheets, body, monthKey, by };
      if (body.action === "saveCell") await saveCell(ctx);
      else if (body.action === "setStatus") await setStatus(ctx);
      else if (body.action === "linkKdi") await linkKdi(ctx);
      else if (body.action === "saveExpenses") await saveExpenses(ctx);
      else { res.status(400).json({ error: "action が正しくありません" }); return; }
      sheets = await loadSheets();
    }
    res.status(200).json(buildPayload({ model, np, viewer, isAdmin, sheets, monthKey }));
  } catch (e) {
    res.status(req.method === "POST" ? 400 : 500).json({ error: e.message || String(e) });
  }
}
