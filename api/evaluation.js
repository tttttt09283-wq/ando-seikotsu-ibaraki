// Vercel Serverless Function: /api/evaluation
// 等級別の月次評価（数値＋行動・100点満点）を読み書きする。
//
//   GET  ?month=2027-01            … その月の評価（見てよい人だけ）と、同じ半期の点数推移
//   POST { action: "save", month, personKey, values, scores, comment } … 直属の上司（または管理者・GM）が保存
//   POST { action: "setup" }       … 管理者のみ。台帳に「評価項目」「評価記録」シートを作る
//   POST { action: "saveItems", grade, items } … 管理者・GM。そのクラスの評価項目を追加・削除・編集する
//   POST { action: "resetItems" }  … 管理者のみ。「評価項目」シートを初期値に戻す
//   POST { action: "setCandidate", personKey, candidate, memo } … 上司・BM・GM・管理者。院長候補のチェック（「スタッフ設定」シート）
//
// 個人売上・対応人数・平均売上は「進捗売上実績」、新患対応数・初回成約率・初回売上は「あんど新規集客」から自動で入る。
//
// 評価項目は台帳の「評価項目」シートを直接編集すれば変更できる（配点・目標値・採点基準など）。

import { batchGet, batchUpdate, getSheetTitles, addSheets, appendRows } from "../lib/google-sheets.js";
import { resolveViewer, filterModelForViewer, canSeeLabor } from "../lib/incentive-calc.js";
import { CAREER_SHEET_ID, loadModel, loadNewPatients, authenticate, viewerNotFound } from "../lib/incentive-data.js";
import {
  ITEM_SHEET, RECORD_SHEET, RECORD_HEADER, DEFAULT_ITEMS, COMMON_GRADE,
  STAFF_SHEET, STAFF_HEADER, parseStaffSettings, canSetCandidate, gradeRank, itemSheetRows, parseItemSheet, parseRecords,
  scoreMonth, itemsFor, validateItems, GRADE_LABELS, AUTO_OPTIONS, parseMonthKey, monthKeyOf, halfMonthKeys, autoValues, superiorOf, canEvaluate, buildRecordRows,
} from "../lib/evaluation.js";
import { normName } from "../lib/incentive-calc.js";

const nowJst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16);

async function loadSheets() {
  const titles = await getSheetTitles(CAREER_SHEET_ID);
  const hasItems = titles.includes(ITEM_SHEET), hasRecords = titles.includes(RECORD_SHEET), hasStaff = titles.includes(STAFF_SHEET);
  const ranges = [];
  if (hasItems) ranges.push(`'${ITEM_SHEET}'!A1:K500`);
  if (hasRecords) ranges.push(`'${RECORD_SHEET}'!A1:M20000`);
  if (hasStaff) ranges.push(`'${STAFF_SHEET}'!A1:E1000`);
  const got = ranges.length ? await batchGet(CAREER_SHEET_ID, ranges) : [];
  const itemRows = hasItems ? got.shift() : null;
  const recordRows = hasRecords ? got.shift() : null;
  const staffRows = hasStaff ? got.shift() : null;
  return {
    hasStaff, staffSettings: parseStaffSettings(staffRows),
    itemRowCount: itemRows ? itemRows.length : 0,
    setupNeeded: !hasItems || !hasRecords,
    hasItems, hasRecords,
    items: parseItemSheet(itemRows) || DEFAULT_ITEMS,
    // 「社会人としての基本（共通）」が無い＝初期の版で作ったシート
    legacyItems: hasItems && !(parseItemSheet(itemRows) || {})[COMMON_GRADE],
    records: parseRecords(recordRows),
  };
}

// 人件費率は社長・GMだけに見せる。それ以外の人には値を送らず、点数（配点×達成度）だけ送る
const LABOR_AUTOS = ["clinic_labor", "block_labor", "company_labor"];
function maskLabor(items, cur, allowed) {
  const values = { ...cur.values }, auto = { ...cur.auto }, hidden = {};
  if (!allowed) {
    for (const k of LABOR_AUTOS) delete auto[k];
    items.forEach((it, i) => {
      if (it.kind === "数値" && LABOR_AUTOS.includes(it.auto)) {
        delete values[it.id];
        hidden[it.id] = cur.result.lines[i].points; // null＝まだ数字が無い
      }
    });
  }
  return { values, auto, hidden, scores: cur.scores };
}

// 保存済みの月は保存時の合計点を使う（あとで評価項目を変えても過去の点数は変わらない）
const storedOr = (d) => (d.rec && d.rec.storedTotal !== null && d.rec.storedTotal !== undefined ? d.rec.storedTotal : d.result.total);

// 自動項目は最新のシートの値を優先し、無ければ保存時の値を使う
function mergedValues(items, rec, auto) {
  const values = { ...(rec ? rec.values : {}) };
  for (const it of items) if (it.auto && auto[it.auto] !== undefined) values[it.id] = auto[it.auto];
  return values;
}

function buildPayload({ model, np, viewer, isAdmin, sheets, monthKey }) {
  const visible = filterModelForViewer(model, viewer).people.filter((p) => itemsFor(sheets.items, p.grade));
  const half = halfMonthKeys(monthKey);
  const people = visible.map((vp) => {
    const person = model.people.find((p) => p.key === vp.key);
    const items = itemsFor(sheets.items, person.grade);
    const monthData = (key) => {
      const rec = sheets.records.get(`${key}|${person.key}`) || null;
      const auto = autoValues(model, person, key, np);
      const values = mergedValues(items, rec, auto);
      const scores = rec ? rec.scores : {};
      return { rec, auto, values, scores, result: scoreMonth(items, values, scores) };
    };
    const cur = monthData(monthKey);
    const trend = half.map((key) => {
      const d = key === monthKey ? cur : monthData(key);
      const pc = items.find((it) => it.id === "pc");
      return { month: key, evaluated: !!d.rec, total: d.rec ? storedOr(d) : null, rank: d.rec ? d.rec.storedRank ?? d.result.rank : null,
        numbers: d.rec ? d.result.numbers.earned : null, behaviors: d.rec ? d.result.behaviors.earned : null,
        pc: d.rec && pc ? d.scores.pc ?? null : null };
    });
    const done = trend.filter((t) => t.evaluated && t.total !== null);
    const halfAvg = done.length ? Math.round((done.reduce((a, t) => a + t.total, 0) / done.length) * 10) / 10 : null;
    const sup = superiorOf(model, person);
    return {
      key: person.key, name: person.name, grade: person.grade, role: person.role, clinics: person.clinics, items,
      superior: sup ? sup.name : "管理者",
      canEdit: canEvaluate(model, viewer, isAdmin, person),
      // 院長候補は本人には見せない
      candidate: person.key !== viewer.personKey && !!(sheets.staffSettings.get(person.key) || {}).candidate,
      candidateMemo: person.key !== viewer.personKey ? (sheets.staffSettings.get(person.key) || {}).memo || "" : "",
      canSetCandidate: canSetCandidate(model, viewer, isAdmin, person),
      evaluated: !!cur.rec, evaluator: cur.rec ? cur.rec.evaluator : "", updatedAt: cur.rec ? cur.rec.updatedAt : "",
      comment: cur.rec ? cur.rec.comment : "",
      ...maskLabor(items, cur, canSeeLabor(viewer)), result: cur.result,
      savedTotal: cur.rec ? storedOr(cur) : null, savedRank: cur.rec ? cur.rec.storedRank ?? cur.result.rank : null,
      trend, halfAvg, halfMonthsEvaluated: done.length,
    };
  });
  // 自分 → 評価する人 → その他 の順
  // クラスが高い順 → 同じクラスは院・名前順
  people.sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade) || (a.clinics[0] || "").localeCompare(b.clinics[0] || "", "ja") || a.name.localeCompare(b.name, "ja"));
  return {
    month: monthKey, halfMonths: half, items: sheets.items, people, setupNeeded: sheets.setupNeeded, viewer, isAdmin,
    canEditItems: isAdmin || viewer.grade === "G6", gradeLabels: GRADE_LABELS, autoOptions: AUTO_OPTIONS,
    legacyItems: sheets.legacyItems, hasRecords: sheets.records.size > 0,
    newPatientError: np && np.error ? np.error : null,
    newPatientUnmatched: isAdmin && np ? np.unmatched : [],
  };
}

async function setCandidate({ model, viewer, isAdmin, staff, body }) {
  const person = model.people.find((p) => p.key === normName(body.personKey));
  if (!person) throw new Error("スタッフが見つかりません");
  if (!canSetCandidate(model, viewer, isAdmin, person)) throw new Error("院長候補を設定できるのは、上司・BM・GM・管理者です（院長より下のクラスのみ）");
  const sheets = await loadSheets();
  if (!sheets.hasStaff) {
    await addSheets(CAREER_SHEET_ID, [STAFF_SHEET]);
    await batchUpdate(CAREER_SHEET_ID, [{ range: `'${STAFF_SHEET}'!A1:E1`, values: [STAFF_HEADER] }]);
  }
  const row = [person.name, body.candidate ? "○" : "", String(body.memo || "").slice(0, 300), viewer.name || staff.name || "管理者", nowJst()];
  const existing = sheets.staffSettings.get(person.key);
  if (existing) await batchUpdate(CAREER_SHEET_ID, [{ range: `'${STAFF_SHEET}'!A${existing.row}:E${existing.row}`, values: [row] }]);
  else await appendRows(CAREER_SHEET_ID, `'${STAFF_SHEET}'!A:E`, [row]);
}

async function setup() {
  const titles = await getSheetTitles(CAREER_SHEET_ID);
  const missing = [ITEM_SHEET, RECORD_SHEET].filter((t) => !titles.includes(t));
  await addSheets(CAREER_SHEET_ID, missing);
  const data = [];
  if (missing.includes(ITEM_SHEET)) {
    const rows = itemSheetRows();
    data.push({ range: `'${ITEM_SHEET}'!A1:K${rows.length}`, values: rows });
  }
  if (missing.includes(RECORD_SHEET)) data.push({ range: `'${RECORD_SHEET}'!A1:M1`, values: [RECORD_HEADER] });
  if (data.length) await batchUpdate(CAREER_SHEET_ID, data);
}

// 1クラス分の項目を差し替えて「評価項目」シートを書き直す（減った行は空欄で上書き）
async function saveItems(body) {
  const grade = String(body.grade || "");
  const list = validateItems(grade, body.items);
  const sheets = await loadSheets();
  if (sheets.setupNeeded) throw new Error("先に「評価シートを準備」を押してください");
  const items = { ...sheets.items, [grade]: list };
  const ordered = Object.fromEntries(Object.keys(GRADE_LABELS).filter((g) => items[g]).map((g) => [g, items[g]]));
  for (const g of Object.keys(items)) if (!ordered[g]) ordered[g] = items[g]; // 一覧に無い等級の行も残す
  const rows = itemSheetRows(ordered);
  while (rows.length < sheets.itemRowCount) rows.push(Array(rows[0].length).fill(""));
  await batchUpdate(CAREER_SHEET_ID, [{ range: `'${ITEM_SHEET}'!A1:K${rows.length}`, values: rows }]);
}

async function resetItems() {
  const sheets = await loadSheets();
  if (sheets.setupNeeded) throw new Error("先に「評価シートを準備」を押してください");
  const rows = itemSheetRows();
  while (rows.length < sheets.itemRowCount) rows.push(Array(rows[0].length).fill(""));
  await batchUpdate(CAREER_SHEET_ID, [{ range: `'${ITEM_SHEET}'!A1:K${rows.length}`, values: rows }]);
}

async function save({ model, np, viewer, isAdmin, staff, body }) {
  const monthKey = String(body.month || "");
  if (!parseMonthKey(monthKey)) throw new Error("対象月が正しくありません");
  const person = model.people.find((p) => p.key === normName(body.personKey));
  if (!person) throw new Error("評価する人が見つかりません");
  const sheets = await loadSheets();
  if (sheets.setupNeeded) throw new Error("先に管理者が「評価シートを準備」を押してください");
  const items = itemsFor(sheets.items, person.grade);
  if (!items) throw new Error(`${person.grade || "等級なし"} の評価項目がありません`);
  if (!canEvaluate(model, viewer, isAdmin, person)) throw new Error("この人を評価できるのは直属の上司です");

  const auto = autoValues(model, person, monthKey, np);
  const values = {}, scores = {};
  for (const it of items) {
    if (it.kind === "数値") {
      if (it.auto && auto[it.auto] !== undefined) { values[it.id] = auto[it.auto]; continue; }
      const raw = body.values && body.values[it.id];
      if (raw === "" || raw === null || raw === undefined) continue;
      const v = Number(String(raw).replace(/[,，%％円¥\s]/g, ""));
      if (!Number.isFinite(v) || v < 0) throw new Error(`「${it.label}」は数字で入力してください`);
      values[it.id] = v;
    } else {
      const s = Number(body.scores && body.scores[it.id]);
      if (s) {
        if (!Number.isInteger(s) || s < 1 || s > 5) throw new Error(`「${it.label}」は1〜5で評価してください`);
        scores[it.id] = s;
      }
    }
  }
  const existing = sheets.records.get(`${monthKey}|${person.key}`) || null;
  const evaluator = viewer.name || staff.name || "管理者";
  const { updates, appends } = buildRecordRows({ monthKey, person, items, values, scores, comment: String(body.comment || "").slice(0, 1000), evaluator, now: nowJst(), existing });
  if (updates.length) await batchUpdate(CAREER_SHEET_ID, updates.map((u) => ({ range: `'${RECORD_SHEET}'!A${u.row}:M${u.row}`, values: [u.values] })));
  if (appends.length) await appendRows(CAREER_SHEET_ID, `'${RECORD_SHEET}'!A:M`, appends);
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "GET・POSTのみ対応しています" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  const staff = await authenticate(req, res);
  if (!staff) return;
  const isAdmin = staff.role === "admin";

  let model, np;
  try {
    model = await loadModel(req.query && req.query.refresh === "1");
    np = await loadNewPatients(model, req.query && req.query.refresh === "1");
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
    return;
  }
  const viewer = resolveViewer(model, staff);
  if (!viewer) return viewerNotFound(res, staff);

  const body = req.body || {};
  let monthKey = (req.method === "POST" ? body.month : req.query && req.query.month) || monthKeyOf(new Date(Date.now() + 9 * 3600 * 1000));
  if (!parseMonthKey(monthKey)) monthKey = monthKeyOf(new Date());

  try {
    if (req.method === "POST") {
      if (body.action === "setup") {
        if (!isAdmin) { res.status(403).json({ error: "評価シートの準備は管理者のみ可能です" }); return; }
        await setup();
      } else if (body.action === "setCandidate") {
        await setCandidate({ model, viewer, isAdmin, staff, body });
      } else if (body.action === "resetItems") {
        if (!isAdmin) { res.status(403).json({ error: "初期値に戻すのは管理者のみ可能です" }); return; }
        await resetItems();
      } else if (body.action === "saveItems") {
        if (!(isAdmin || viewer.grade === "G6")) { res.status(403).json({ error: "評価項目の編集は管理者・GMのみ可能です" }); return; }
        await saveItems(body);
      } else if (body.action === "save") {
        await save({ model, np, viewer, isAdmin, staff, body });
      } else {
        res.status(400).json({ error: "action が正しくありません" });
        return;
      }
    }
    const sheets = await loadSheets();
    res.status(200).json(buildPayload({ model, np, viewer, isAdmin, sheets, monthKey }));
  } catch (e) {
    res.status(req.method === "POST" ? 400 : 500).json({ error: e.message || String(e) });
  }
}
