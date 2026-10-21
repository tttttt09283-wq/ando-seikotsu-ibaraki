// Vercel Serverless Function: /api/evaluation
// 等級別の月次評価（数値＋行動・100点満点）を読み書きする。
//
//   GET  ?month=2027-01            … その月の評価（見てよい人だけ）と、同じ半期の点数推移
//   POST { action: "save", month, personKey, values, scores, comment } … 直属の上司（または管理者・GM）が保存
//   POST { action: "setup" }       … 管理者のみ。台帳に「評価項目」「評価記録」シートを作る
//
// 評価項目は台帳の「評価項目」シートを直接編集すれば変更できる（配点・目標値・採点基準など）。

import { batchGet, batchUpdate, getSheetTitles, addSheets, appendRows } from "../lib/google-sheets.js";
import { resolveViewer, filterModelForViewer } from "../lib/incentive-calc.js";
import { CAREER_SHEET_ID, loadModel, authenticate, viewerNotFound } from "../lib/incentive-data.js";
import {
  ITEM_SHEET, RECORD_SHEET, RECORD_HEADER, DEFAULT_ITEMS, itemSheetRows, parseItemSheet, parseRecords,
  scoreMonth, parseMonthKey, monthKeyOf, halfMonthKeys, autoValues, superiorOf, canEvaluate, buildRecordRows,
} from "../lib/evaluation.js";
import { normName } from "../lib/incentive-calc.js";

const nowJst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16);

async function loadSheets() {
  const titles = await getSheetTitles(CAREER_SHEET_ID);
  const hasItems = titles.includes(ITEM_SHEET), hasRecords = titles.includes(RECORD_SHEET);
  const ranges = [];
  if (hasItems) ranges.push(`'${ITEM_SHEET}'!A1:K300`);
  if (hasRecords) ranges.push(`'${RECORD_SHEET}'!A1:M20000`);
  const got = ranges.length ? await batchGet(CAREER_SHEET_ID, ranges) : [];
  const itemRows = hasItems ? got.shift() : null;
  const recordRows = hasRecords ? got.shift() : null;
  return {
    setupNeeded: !hasItems || !hasRecords,
    hasItems, hasRecords,
    items: parseItemSheet(itemRows) || DEFAULT_ITEMS,
    records: parseRecords(recordRows),
  };
}

// 自動項目は最新のシートの値を優先し、無ければ保存時の値を使う
function mergedValues(items, rec, auto) {
  const values = { ...(rec ? rec.values : {}) };
  for (const it of items) if (it.auto && auto[it.auto] !== undefined) values[it.id] = auto[it.auto];
  return values;
}

function buildPayload({ model, viewer, isAdmin, sheets, monthKey }) {
  const visible = filterModelForViewer(model, viewer).people.filter((p) => sheets.items[p.grade]);
  const half = halfMonthKeys(monthKey);
  const people = visible.map((vp) => {
    const person = model.people.find((p) => p.key === vp.key);
    const items = sheets.items[person.grade];
    const monthData = (key) => {
      const rec = sheets.records.get(`${key}|${person.key}`) || null;
      const auto = autoValues(model, person, key);
      const values = mergedValues(items, rec, auto);
      const scores = rec ? rec.scores : {};
      return { rec, auto, values, scores, result: scoreMonth(items, values, scores) };
    };
    const cur = monthData(monthKey);
    const trend = half.map((key) => {
      const d = key === monthKey ? cur : monthData(key);
      const pc = items.find((it) => it.id === "pc");
      return { month: key, evaluated: !!d.rec, total: d.rec ? d.result.total : null, rank: d.rec ? d.result.rank : null,
        numbers: d.rec ? d.result.numbers.earned : null, behaviors: d.rec ? d.result.behaviors.earned : null,
        pc: d.rec && pc ? d.scores.pc ?? null : null };
    });
    const done = trend.filter((t) => t.evaluated && t.total !== null);
    const halfAvg = done.length ? Math.round((done.reduce((a, t) => a + t.total, 0) / done.length) * 10) / 10 : null;
    const sup = superiorOf(model, person);
    return {
      key: person.key, name: person.name, grade: person.grade, role: person.role, clinics: person.clinics,
      superior: sup ? sup.name : "管理者",
      canEdit: canEvaluate(model, viewer, isAdmin, person),
      evaluated: !!cur.rec, evaluator: cur.rec ? cur.rec.evaluator : "", updatedAt: cur.rec ? cur.rec.updatedAt : "",
      comment: cur.rec ? cur.rec.comment : "",
      values: cur.values, scores: cur.scores, auto: cur.auto, result: cur.result,
      trend, halfAvg, halfMonthsEvaluated: done.length,
    };
  });
  // 自分 → 評価する人 → その他 の順
  people.sort((a, b) => (b.key === viewer.personKey) - (a.key === viewer.personKey) || b.canEdit - a.canEdit);
  return { month: monthKey, halfMonths: half, items: sheets.items, people, setupNeeded: sheets.setupNeeded, viewer, isAdmin };
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

async function save({ model, viewer, isAdmin, staff, body }) {
  const monthKey = String(body.month || "");
  if (!parseMonthKey(monthKey)) throw new Error("対象月が正しくありません");
  const person = model.people.find((p) => p.key === normName(body.personKey));
  if (!person) throw new Error("評価する人が見つかりません");
  const sheets = await loadSheets();
  if (sheets.setupNeeded) throw new Error("先に管理者が「評価シートを準備」を押してください");
  const items = sheets.items[person.grade];
  if (!items) throw new Error(`${person.grade || "等級なし"} の評価項目がありません`);
  if (!canEvaluate(model, viewer, isAdmin, person)) throw new Error("この人を評価できるのは直属の上司です");

  const auto = autoValues(model, person, monthKey);
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

  let model;
  try {
    model = await loadModel(req.query && req.query.refresh === "1");
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
      } else if (body.action === "save") {
        await save({ model, viewer, isAdmin, staff, body });
      } else {
        res.status(400).json({ error: "action が正しくありません" });
        return;
      }
    }
    const sheets = await loadSheets();
    res.status(200).json(buildPayload({ model, viewer, isAdmin, sheets, monthKey }));
  } catch (e) {
    res.status(req.method === "POST" ? 400 : 500).json({ error: e.message || String(e) });
  }
}
