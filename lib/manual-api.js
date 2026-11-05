// /api/manual（vercel.json で /api/evaluation?__manual=1 に振り替え。関数の数を12以内に保つため）
// あんど整骨院マニュアル：理念・クラス別の方針・施術者／社会人の基準（定量・定性）・育成カリキュラム・読んだ記録。
// データは台帳（キャリア制度・人件費42%管理台帳）の「マニュアル」「育成カリキュラム」「カリキュラム進捗」「マニュアル確認」シート。
//
//   GET                                              … マニュアル全体・評価項目との対応・自分と担当スタッフの進み具合
//   POST { action: "saveItem", item, originalId }    … 社長・GM：マニュアル項目の追加・編集
//   POST { action: "deleteItem", id }                … 社長・GM：マニュアル項目の削除
//   POST { action: "saveStep", step, originalId }    … 社長・GM：カリキュラムのステップの追加・編集
//   POST { action: "deleteStep", id }                … 社長・GM：ステップの削除
//   POST { action: "setProgress", personKey, stepId, status, memo } … 合格は同じ院の副院長以上・社長・GM。本人は「練習中」まで
//   POST { action: "confirmRead", grade }            … 本人：そのクラスのマニュアルを読んだ記録

import { batchGet, batchUpdate, getSheetTitles, addSheets, appendRows } from "./google-sheets.js";
import { resolveViewer, normName } from "./incentive-calc.js";
import { CAREER_SHEET_ID, loadModel, authenticate, viewerNotFound } from "./incentive-data.js";
import { ITEM_SHEET, DEFAULT_ITEMS, parseItemSheet, withAddedDefaults } from "./evaluation.js";
import {
  COMMON, MANUAL_GRADES, MANUAL_GRADE_LABELS, AREAS, MEASURES, RINEN, STEP_STATUSES,
  MANUAL_SHEET, MANUAL_HEADER, CURRICULUM_SHEET, CURRICULUM_HEADER, PROGRESS_SHEET, PROGRESS_HEADER, READ_SHEET, READ_HEADER,
  DEFAULT_MANUAL, DEFAULT_CURRICULUM, parseManual, manualRows, parseCurriculum, curriculumRows, parseProgress, parseReads,
  validateManualItem, validateStep, upsert, removeById, readStatus, manualGradeOf, evaluationMap, attachEval, curriculumProgress, canCheck,
} from "./manual.js";

const nowJst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16);
const colOf = (n) => String.fromCharCode(64 + n);

async function loadSheets() {
  const titles = await getSheetTitles(CAREER_SHEET_ID);
  const want = [
    [MANUAL_SHEET, "A1:K2000"], [CURRICULUM_SHEET, "A1:J1000"], [PROGRESS_SHEET, "A1:G20000"], [READ_SHEET, "A1:D5000"], [ITEM_SHEET, "A1:K500"],
  ];
  const have = want.filter(([t]) => titles.includes(t));
  const got = have.length ? await batchGet(CAREER_SHEET_ID, have.map(([t, r]) => `'${t}'!${r}`)) : [];
  const rows = Object.fromEntries(have.map(([t], i) => [t, got[i] || []]));
  const manual = parseManual(rows[MANUAL_SHEET]);
  const curriculum = parseCurriculum(rows[CURRICULUM_SHEET]);
  return {
    titles,
    manual: manual || DEFAULT_MANUAL, manualDefault: !manual, manualRowCount: (rows[MANUAL_SHEET] || []).length,
    curriculum: curriculum || DEFAULT_CURRICULUM, curriculumDefault: !curriculum, curriculumRowCount: (rows[CURRICULUM_SHEET] || []).length,
    progress: parseProgress(rows[PROGRESS_SHEET]), reads: parseReads(rows[READ_SHEET]),
    items: withAddedDefaults(parseItemSheet(rows[ITEM_SHEET]) || DEFAULT_ITEMS),
  };
}

const isTop = (viewer, isAdmin) => isAdmin || viewer.scope === "all"; // 社長・GM
const progressObj = (m) => Object.fromEntries([...(m || new Map())].map(([k, v]) => [k, { status: v.status, checker: v.checker, at: v.at, memo: v.memo }]));

function personView(sheets, p, viewer, isAdmin) {
  const grade = manualGradeOf(p.grade);
  const prog = sheets.progress.get(p.key);
  return {
    key: p.key, name: p.name, grade: p.grade, manualGrade: grade, clinics: p.clinics || [],
    canCheck: canCheck(viewer, isAdmin, p),
    progress: progressObj(prog),
    summary: curriculumProgress(sheets.curriculum, prog, grade),
    reads: { [COMMON]: readStatus(sheets.reads, sheets.manual, p.key, COMMON), [grade]: readStatus(sheets.reads, sheets.manual, p.key, grade) },
  };
}

export function buildPayload({ model, viewer, isAdmin, sheets }) {
  const top = isTop(viewer, isAdmin);
  const staff = model.people.filter((p) => p.grade && !/^-P/.test(p.grade));
  const me = viewer.personKey ? staff.find((p) => p.key === viewer.personKey) : null;
  // 見える人：社長・GMは全員。副院長以上は同じ院の下のクラスの人。それ以外は自分だけ
  const others = staff.filter((p) => p !== me && (top || canCheck(viewer, isAdmin, p)));
  const people = [...(me ? [me] : []), ...others].map((p) => personView(sheets, p, viewer, isAdmin));
  return {
    viewer: { name: viewer.name, personKey: viewer.personKey || null, grade: me ? me.grade : viewer.grade || "", manualGrade: me ? manualGradeOf(me.grade) : top ? "G6" : "G2", scope: viewer.scope },
    canEdit: top,
    grades: MANUAL_GRADES, gradeLabels: MANUAL_GRADE_LABELS, common: COMMON, areas: AREAS, measures: MEASURES, rinen: RINEN, stepStatuses: STEP_STATUSES,
    usingDefaults: { manual: sheets.manualDefault, curriculum: sheets.curriculumDefault },
    manual: attachEval(sheets.manual, sheets.items),
    evaluation: Object.fromEntries(MANUAL_GRADES.map((g) => [g, evaluationMap(sheets.items, sheets.manual, g)])),
    evalItemOptions: Object.fromEntries([COMMON, ...MANUAL_GRADES].map((g) => [g, (sheets.items[g] || []).map((it) => ({ id: it.id, label: it.label, kind: it.kind }))])),
    curriculum: sheets.curriculum,
    people,
  };
}

// ===== 書き込み =====
async function ensureSheet(sheets, title, header) {
  if (sheets.titles.includes(title)) return;
  await addSheets(CAREER_SHEET_ID, [title]);
  await batchUpdate(CAREER_SHEET_ID, [{ range: `'${title}'!A1:${colOf(header.length)}1`, values: [header] }], "RAW");
  sheets.titles.push(title);
}
// シート全体を書き直す（行が減ったときは残りを空にする）
async function rewrite(sheets, title, header, rows, prevCount) {
  await ensureSheet(sheets, title, header);
  const out = rows.map((r) => r.map((v) => v ?? ""));
  while (out.length < prevCount) out.push(Array(header.length).fill(""));
  await batchUpdate(CAREER_SHEET_ID, [{ range: `'${title}'!A1:${colOf(header.length)}${out.length}`, values: out }], "RAW");
}
function requireTop(ctx) {
  if (!isTop(ctx.viewer, ctx.isAdmin)) throw new Error("マニュアルを編集できるのは社長・GMです");
}
async function saveItem(ctx) {
  requireTop(ctx);
  const { sheets, body, by } = ctx;
  const item = validateManualItem(body.item);
  const originalId = String(body.originalId || "");
  let list = sheets.manual;
  if (originalId && originalId !== item.id) {
    if (list.some((m) => m.id === item.id)) throw new Error("同じ項目IDがすでにあります");
    const old = list.find((m) => m.id === originalId);
    if (old && !item.order) item.order = old.order;
    list = removeById(list, originalId);
  } else if (!originalId && list.some((m) => m.id === item.id)) throw new Error("同じ項目IDがすでにあります");
  list = upsert(list, item, by, nowJst());
  await rewrite(sheets, MANUAL_SHEET, MANUAL_HEADER, manualRows(list), sheets.manualRowCount);
}
async function deleteItem(ctx) {
  requireTop(ctx);
  const { sheets, body } = ctx;
  if (!sheets.manual.some((m) => m.id === body.id)) throw new Error("項目が見つかりません");
  await rewrite(sheets, MANUAL_SHEET, MANUAL_HEADER, manualRows(removeById(sheets.manual, body.id)), sheets.manualRowCount);
}
async function saveStep(ctx) {
  requireTop(ctx);
  const { sheets, body, by } = ctx;
  const step = validateStep(body.step);
  const originalId = String(body.originalId || "");
  let list = sheets.curriculum;
  if (originalId && originalId !== step.id) {
    if (list.some((s) => s.id === step.id)) throw new Error("同じステップIDがすでにあります");
    const old = list.find((s) => s.id === originalId);
    if (old && !step.order) step.order = old.order;
    list = removeById(list, originalId);
  } else if (!originalId && list.some((s) => s.id === step.id)) throw new Error("同じステップIDがすでにあります");
  list = upsert(list, step, by, nowJst());
  await rewrite(sheets, CURRICULUM_SHEET, CURRICULUM_HEADER, curriculumRows(list), sheets.curriculumRowCount);
}
async function deleteStep(ctx) {
  requireTop(ctx);
  const { sheets, body } = ctx;
  if (!sheets.curriculum.some((s) => s.id === body.id)) throw new Error("ステップが見つかりません");
  await rewrite(sheets, CURRICULUM_SHEET, CURRICULUM_HEADER, curriculumRows(removeById(sheets.curriculum, body.id)), sheets.curriculumRowCount);
}
async function setProgress(ctx) {
  const { model, viewer, isAdmin, sheets, body, by } = ctx;
  const person = model.people.find((p) => p.key === normName(body.personKey));
  if (!person) throw new Error("スタッフが見つかりません");
  const step = sheets.curriculum.find((s) => s.id === body.stepId);
  if (!step) throw new Error("ステップが見つかりません");
  const status = String(body.status || "");
  if (status && !STEP_STATUSES.includes(status)) throw new Error("状態が正しくありません");
  const cur = (sheets.progress.get(person.key) || new Map()).get(step.id);
  const self = viewer.personKey === person.key;
  if (!canCheck(viewer, isAdmin, person)) {
    if (!self) throw new Error("この人のカリキュラムを確認できるのは、同じ院の副院長以上・社長・GMです");
    if (status === "合格" || (cur && cur.status === "合格")) throw new Error("合格をつけたり外したりできるのは、確認者（副院長以上）です");
  }
  await ensureSheet(sheets, PROGRESS_SHEET, PROGRESS_HEADER);
  const row = [person.key, person.name, step.id, status, by, nowJst(), String(body.memo ?? (cur ? cur.memo : "")).slice(0, 300)];
  if (cur) await batchUpdate(CAREER_SHEET_ID, [{ range: `'${PROGRESS_SHEET}'!A${cur.row}:G${cur.row}`, values: [row] }], "RAW");
  else await appendRows(CAREER_SHEET_ID, `'${PROGRESS_SHEET}'!A:G`, [row]);
}
async function confirmRead(ctx) {
  const { viewer, sheets, body } = ctx;
  if (!viewer.personKey) throw new Error("スタッフとして登録されている人だけが記録できます");
  const grade = String(body.grade || "");
  if (!(grade === COMMON || MANUAL_GRADES.includes(grade))) throw new Error("クラスが正しくありません");
  await ensureSheet(sheets, READ_SHEET, READ_HEADER);
  const row = [viewer.personKey, viewer.name, grade, nowJst()];
  const cur = sheets.reads.get(`${viewer.personKey}|${grade}`);
  if (cur) await batchUpdate(CAREER_SHEET_ID, [{ range: `'${READ_SHEET}'!A${cur.row}:D${cur.row}`, values: [row] }], "RAW");
  else await appendRows(CAREER_SHEET_ID, `'${READ_SHEET}'!A:D`, [row]);
}

const ACTIONS = { saveItem, deleteItem, saveStep, deleteStep, setProgress, confirmRead };

export async function manualHandler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") { res.status(405).json({ error: "GET・POSTのみ対応しています" }); return; }
  res.setHeader("Cache-Control", "no-store");
  const staff = await authenticate(req, res);
  if (!staff) return;
  const isAdmin = staff.role === "admin";
  let model;
  try { model = await loadModel(req.query && req.query.refresh === "1"); } catch (e) { res.status(500).json({ error: e.message || String(e) }); return; }
  const viewer = resolveViewer(model, staff);
  if (!viewer) return viewerNotFound(res, staff);
  const body = req.body || {};
  try {
    let sheets = await loadSheets();
    if (req.method === "POST") {
      const fn = ACTIONS[body.action];
      if (!fn) { res.status(400).json({ error: "action が正しくありません" }); return; }
      await fn({ model, viewer, isAdmin, sheets, body, by: viewer.name || staff.name || "管理者" });
      sheets = await loadSheets();
    }
    res.status(200).json(buildPayload({ model, viewer, isAdmin, sheets }));
  } catch (e) {
    res.status(req.method === "POST" ? 400 : 500).json({ error: e.message || String(e) });
  }
}
