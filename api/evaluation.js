// Vercel Serverless Function: /api/evaluation
// 等級別の月次評価（数値＋行動・100点満点）を読み書きする。
//
//   GET  ?month=2027-01            … その月の評価（見てよい人だけ）と、同じ半期の点数推移
//   POST { action: "save", month, personKey, values, scores, comment } … 直属の上司（または管理者・GM）が保存
//   POST { action: "setup" }       … 管理者のみ。台帳に「評価項目」「評価記録」シートを作る
//   POST { action: "saveItems", grade, items } … 管理者・GM。そのクラスの評価項目を追加・削除・編集する
//   POST { action: "resetItems" }  … 管理者のみ。「評価項目」シートを初期値に戻す
//   POST { action: "saveEvent", date, name, memo, entries, replace } … 社長・GM。全社イベントの登録（加点・報酬）
//   POST { action: "deleteEvent", date, name } … 社長・GM。全社イベントの削除
//   POST { action: "saveDeptMembers", dept, memberKeys } … 管理者・GM。部門の担当者（「スタッフ設定」シートの部門列）
//   POST { action: "setCandidate", personKey, candidate, memo } … 上司・BM・GM・管理者。院長候補のチェック（「スタッフ設定」シート）
//
// 個人売上・対応人数・平均売上は「進捗売上実績」、新患対応数・初回成約率・初回売上は「あんど新規集客」から自動で入る。
//
// 評価項目は台帳の「評価項目」シートを直接編集すれば変更できる（配点・目標値・採点基準など）。

import { batchGet, batchUpdate, getSheetTitles, addSheets, appendRows } from "../lib/google-sheets.js";
import { resolveViewer, filterModelForViewer, canSeeLabor } from "../lib/incentive-calc.js";
import { CAREER_SHEET_ID, loadModel, invalidateModel, loadNewPatients, authenticate, viewerNotFound } from "../lib/incentive-data.js";
import { EVENT_SHEET, EVENT_HEADER, MAX_EVENT_BONUS, eventBonusMap, groupEvents, normDate } from "../lib/events.js";
import {
  ITEM_SHEET, RECORD_SHEET, RECORD_HEADER, DEFAULT_ITEMS, COMMON_GRADE,
  STAFF_SHEET, STAFF_HEADER, parseStaffSettings, DEPT_PREFIX, DEFAULT_DEPARTMENTS, departmentNames, deptMembership, canSetCandidate, gradeRank, itemSheetRows, parseItemSheet, parseRecords,
  scoreMonth, rankOf, itemsFor, validateItems, GRADE_LABELS, AUTO_OPTIONS, parseMonthKey, monthKeyOf, halfMonthKeys, autoValues, superiorOf, canEvaluate, buildRecordRows,
} from "../lib/evaluation.js";
import { normName } from "../lib/incentive-calc.js";
import { LADDER_SHEET, parseLadder, judgeCareer, maskSensitive } from "../lib/career-judgement.js";

const nowJst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16);

async function loadSheets() {
  const titles = await getSheetTitles(CAREER_SHEET_ID);
  const hasItems = titles.includes(ITEM_SHEET), hasRecords = titles.includes(RECORD_SHEET), hasStaff = titles.includes(STAFF_SHEET);
  const ranges = [];
  if (hasItems) ranges.push(`'${ITEM_SHEET}'!A1:K500`);
  if (hasRecords) ranges.push(`'${RECORD_SHEET}'!A1:M20000`);
  if (hasStaff) ranges.push(`'${STAFF_SHEET}'!A1:E1000`);
  const hasLadder = titles.includes(LADDER_SHEET);
  if (hasLadder) ranges.push(`'${LADDER_SHEET}'!A1:L40`);
  const got = ranges.length ? await batchGet(CAREER_SHEET_ID, ranges) : [];
  const itemRows = hasItems ? got.shift() : null;
  const recordRows = hasRecords ? got.shift() : null;
  const staffRows = hasStaff ? got.shift() : null;
  const ladderRows = hasLadder ? got.shift() : null;
  return {
    hasStaff, staffSettings: parseStaffSettings(staffRows), ladder: parseLadder(ladderRows),
    itemRowCount: itemRows ? itemRows.length : 0,
    setupNeeded: !hasItems || !hasRecords,
    hasItems, hasRecords,
    items: withDefaultDepartments(parseItemSheet(itemRows) || DEFAULT_ITEMS),
    // 「社会人としての基本（共通）」が無い＝初期の版で作ったシート
    legacyItems: hasItems && !(parseItemSheet(itemRows) || {})[COMMON_GRADE],
    records: parseRecords(recordRows),
  };
}

// 人件費率は社長・GM・BM・院長に見せる。スタッフには値を送らず、点数（配点×達成度）だけ送る
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

// 部門ができる前に作った評価項目シートには部門の行が無いので、その場合は既定の部門の項目を使う
function withDefaultDepartments(items) {
  if (departmentNames(items).length) return items;
  const out = { ...items };
  for (const d of DEFAULT_DEPARTMENTS) out[DEPT_PREFIX + d.name] = d.items;
  return out;
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
  const membership = deptMembership(model, sheets.staffSettings, sheets.items);
  const deptsOf = (key) => membership.get(key) || [];
  const visible = filterModelForViewer(model, viewer).people.filter((p) => itemsFor(sheets.items, p.grade));
  const half = halfMonthKeys(monthKey);
  // 全社イベントの加点を、保存済みの月次評価の合計点に足す（上限なし）
  const bonus = eventBonusMap(model.events || []);
  const records = new Map([...sheets.records].map(([k, rec]) => {
    const b = bonus.get(k) || 0;
    if (!b || rec.storedTotal == null) return [k, rec];
    const t = Math.round((rec.storedTotal + b) * 10) / 10;
    return [k, { ...rec, baseTotal: rec.storedTotal, storedTotal: t, storedRank: rec.storedRank ? rankOf(t) : null }]; // 全項目入力済みの月だけランクを付ける
  }));
  const people = visible.map((vp) => {
    const person = model.people.find((p) => p.key === vp.key);
    const items = itemsFor(sheets.items, person.grade, deptsOf(person.key));
    const monthData = (key) => {
      const rec = records.get(`${key}|${person.key}`) || null;
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
      key: person.key, name: person.name, grade: person.grade, role: person.role, clinics: person.clinics, items, depts: deptsOf(person.key),
      superior: sup ? sup.name : "管理者",
      canEdit: canEvaluate(model, viewer, isAdmin, person),
      // 院長候補は本人には見せない
      candidate: person.key !== viewer.personKey && !!(sheets.staffSettings.get(person.key) || {}).candidate,
      candidateMemo: person.key !== viewer.personKey ? (sheets.staffSettings.get(person.key) || {}).memo || "" : "",
      canSetCandidate: canSetCandidate(model, viewer, isAdmin, person),
      // 昇格・降格の判定と理由（人件費の数字は見られる人にだけ）
      career: maskSensitive(judgeCareer(person, { model, np, records, monthKey, halfKeys: half, ladder: sheets.ladder }), canSeeLabor(viewer)),
      evaluated: !!cur.rec, evaluator: cur.rec ? cur.rec.evaluator : "", updatedAt: cur.rec ? cur.rec.updatedAt : "",
      comment: cur.rec ? cur.rec.comment : "",
      ...maskLabor(items, cur, canSeeLabor(viewer)), result: cur.result,
      savedTotal: cur.rec ? storedOr(cur) : null, savedRank: cur.rec ? cur.rec.storedRank ?? cur.result.rank : null,
      eventBonus: bonus.get(`${monthKey}|${person.key}`) || 0,
      events: (model.events || []).filter((e) => e.key === person.key && e.month === monthKey)
        .map((e) => ({ date: e.date, name: e.name, result: e.result, bonus: e.bonus, reward: e.reward })),
      trend, halfAvg, halfMonthsEvaluated: done.length,
    };
  });
  // 自分 → 評価する人 → その他 の順
  // クラスが高い順 → 同じクラスは院・名前順
  people.sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade) || (a.clinics[0] || "").localeCompare(b.clinics[0] || "", "ja") || a.name.localeCompare(b.name, "ja"));
  return {
    month: monthKey, halfMonths: half, items: sheets.items, people, setupNeeded: sheets.setupNeeded, viewer, isAdmin,
    canEditItems: isAdmin || viewer.grade === "G6", gradeLabels: GRADE_LABELS, autoOptions: AUTO_OPTIONS,
    // 部門と担当者（評価項目の設定画面用。社長・GMだけ）
    departments: (isAdmin || viewer.grade === "G6") ? departmentNames(sheets.items).map((d) => ({
      name: d, members: model.people.filter((p) => deptsOf(p.key).includes(d)).map((p) => p.key),
    })) : [],
    eventGroups: (isAdmin || viewer.grade === "G6") ? groupEvents(model.events || []) : [],
    maxEventBonus: MAX_EVENT_BONUS,
    allPeople: (isAdmin || viewer.grade === "G6") ? model.people.filter((p) => p.grade).map((p) => ({ key: p.key, name: p.name, grade: p.grade, clinics: p.clinics }))
      .sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade)) : [],
    legacyItems: sheets.legacyItems, hasRecords: sheets.records.size > 0,
    newPatientError: np && np.error ? np.error : null,
    newPatientUnmatched: isAdmin && np ? np.unmatched : [],
  };
}

// 部門の担当者を保存する。「スタッフ設定」シートに部門列（F列）を作り、全員分の担当部門を書く
async function saveDeptMembers({ model, body }) {
  const sheets = await loadSheets();
  const dept = String(body.dept || "");
  if (!departmentNames(sheets.items).includes(dept)) throw new Error("部門が見つかりません。先に評価項目を保存してください");
  const keys = new Set((body.memberKeys || []).map(normName));
  const membership = deptMembership(model, sheets.staffSettings, sheets.items); // いまの担当（既定を含む）
  for (const p of model.people) {
    const cur = membership.get(p.key) || [];
    if (keys.has(p.key) && !cur.includes(dept)) membership.set(p.key, [...cur, dept]);
    if (!keys.has(p.key) && cur.includes(dept)) membership.set(p.key, cur.filter((d) => d !== dept));
  }
  if (!sheets.hasStaff) await addSheets(CAREER_SHEET_ID, [STAFF_SHEET]);
  const data = [{ range: `'${STAFF_SHEET}'!A1:F1`, values: [STAFF_HEADER] }];
  const appends = [];
  for (const p of model.people) {
    const depts = (membership.get(p.key) || []).join("、");
    const row = sheets.staffSettings.get(p.key);
    if (row) data.push({ range: `'${STAFF_SHEET}'!F${row.row}`, values: [[depts]] });
    else if (depts) appends.push([p.name, "", "", "", "", depts]);
  }
  await batchUpdate(CAREER_SHEET_ID, data, "RAW");
  if (appends.length) await appendRows(CAREER_SHEET_ID, `'${STAFF_SHEET}'!A:F`, appends);
}

// ===== 全社イベント =====
async function ensureEventSheet() {
  const titles = await getSheetTitles(CAREER_SHEET_ID);
  if (!titles.includes(EVENT_SHEET)) {
    await addSheets(CAREER_SHEET_ID, [EVENT_SHEET]);
    await batchUpdate(CAREER_SHEET_ID, [{ range: `'${EVENT_SHEET}'!A1:I1`, values: [EVENT_HEADER] }], "RAW");
  }
}

// 同じ日付・名前のイベントの行を空にする（削除・上書き用）
async function clearEventRows(model, date, name) {
  const rows = (model.events || []).filter((e) => e.date === date && e.name === name).map((e) => e.row);
  if (rows.length) await batchUpdate(CAREER_SHEET_ID, rows.map((r) => ({ range: `'${EVENT_SHEET}'!A${r}:I${r}`, values: [Array(9).fill("")] })), "RAW");
}

async function saveEvent({ model, viewer, staff, body }) {
  const date = normDate(body.date);
  const name = String(body.name || "").trim().slice(0, 40);
  if (!date) throw new Error("日付を入れてください");
  if (!name) throw new Error("イベント名を入れてください");
  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (!entries.length) throw new Error("参加者を1人以上入れてください");
  if (entries.length > 100) throw new Error("参加者は100人までです");
  const rows = entries.map((e, i) => {
    const p = model.people.find((x) => x.key === normName(e.personKey));
    if (!p) throw new Error(`${i + 1}行目の参加者が見つかりません`);
    const b = Number(e.bonus || 0), r = Number(String(e.reward || 0).replace(/[,，¥円\s]/g, ""));
    if (!Number.isFinite(b) || b < 0 || b > MAX_EVENT_BONUS) throw new Error(`${p.name}さんの加点は0〜${MAX_EVENT_BONUS}で入れてください`);
    if (!Number.isFinite(r) || r < 0 || r > 10000000) throw new Error(`${p.name}さんの報酬額が正しくありません`);
    return [date, name, p.name, String(e.result || "").slice(0, 100), b, Math.round(r), String(body.memo || "").slice(0, 200), viewer.name || staff.name || "管理者", nowJst()];
  });
  await ensureEventSheet();
  const replace = body.replace && normDate(body.replace.date) ? { date: normDate(body.replace.date), name: String(body.replace.name || "") } : { date, name };
  await clearEventRows(model, replace.date, replace.name);
  await appendRows(CAREER_SHEET_ID, `'${EVENT_SHEET}'!A:I`, rows);
  invalidateModel();
}

async function deleteEvent({ model, body }) {
  await clearEventRows(model, normDate(body.date), String(body.name || ""));
  invalidateModel();
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
  const items = itemsFor(sheets.items, person.grade, deptMembership(model, sheets.staffSettings, sheets.items).get(person.key) || []);
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
      } else if (body.action === "saveEvent" || body.action === "deleteEvent") {
        if (!(isAdmin || viewer.grade === "G6")) { res.status(403).json({ error: "全社イベントの登録は社長・GMのみ可能です" }); return; }
        if (body.action === "saveEvent") await saveEvent({ model, viewer, staff, body });
        else await deleteEvent({ model, body });
        model = await loadModel(true);
      } else if (body.action === "saveDeptMembers") {
        if (!(isAdmin || viewer.grade === "G6")) { res.status(403).json({ error: "部門の担当者の設定は社長・GMのみ可能です" }); return; }
        await saveDeptMembers({ model, body });
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
