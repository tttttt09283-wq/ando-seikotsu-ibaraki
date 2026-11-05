import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMON, MANUAL_GRADES, DEFAULT_MANUAL, DEFAULT_CURRICULUM, MANUAL_HEADER, CURRICULUM_HEADER,
  parseManual, manualRows, parseCurriculum, curriculumRows, parseProgress, parseReads,
  validateManualItem, validateStep, upsert, removeById, readStatus, manualGradeOf, evaluationMap, attachEval, curriculumProgress, canCheck,
} from "../lib/manual.js";
import { DEFAULT_ITEMS, withAddedDefaults } from "../lib/evaluation.js";

const items = withAddedDefaults(DEFAULT_ITEMS);

test("初期値：IDは重複せず、全クラスに使命・方針・施術者・社会人（定量と定性）がある", () => {
  const ids = DEFAULT_MANUAL.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(DEFAULT_MANUAL.filter((m) => m.area === "理念").map((m) => m.rinen).join(""), "心豊笑幸");
  for (const g of MANUAL_GRADES) {
    const l = DEFAULT_MANUAL.filter((m) => m.grade === g);
    assert.equal(l.filter((m) => m.area === "使命").length, 1, `${g} 使命`);
    assert.ok(l.some((m) => m.area === "方針"), `${g} 方針`);
    assert.ok(l.some((m) => m.area === "社会人" && m.measure === "定量"), `${g} 社会人・定量`);
    assert.ok(l.some((m) => m.area === "社会人" && m.measure === "定性"), `${g} 社会人・定性`);
    assert.ok(l.some((m) => m.area === "施術者"), `${g} 施術者`);
  }
  const sids = DEFAULT_CURRICULUM.map((s) => s.id);
  assert.equal(new Set(sids).size, sids.length);
  assert.ok(DEFAULT_CURRICULUM.filter((s) => s.grade === "G1").length >= 15);
});

test("初期値：紐づけた評価項目はすべて評価項目の初期値にあり、定量／定性が評価の区分と一致する", () => {
  for (const m of DEFAULT_MANUAL.filter((x) => x.evalId)) {
    const pool = m.grade === COMMON ? items[COMMON] : [...items[m.grade], ...items[COMMON]];
    const it = pool.find((x) => x.id === m.evalId);
    assert.ok(it, `${m.id} → ${m.evalId}`);
    assert.equal(m.measure, it.kind === "数値" ? "定量" : "定性", `${m.id} の定量/定性`);
  }
  // 新人〜GMの評価項目は全部マニュアルに説明がある
  for (const g of MANUAL_GRADES) {
    const unassigned = evaluationMap(items, DEFAULT_MANUAL, g).filter((r) => !r.area);
    assert.deepEqual(unassigned.map((r) => r.id), [], g);
  }
});

test("シートの読み書き：書いた行を読み直すと同じ内容", () => {
  const back = parseManual(manualRows(DEFAULT_MANUAL));
  assert.equal(back.length, DEFAULT_MANUAL.length);
  assert.deepEqual(back[5], DEFAULT_MANUAL[5]);
  const cb = parseCurriculum(curriculumRows(DEFAULT_CURRICULUM));
  assert.deepEqual(cb.map((s) => s.id), DEFAULT_CURRICULUM.map((s) => s.id));
  assert.equal(parseManual([MANUAL_HEADER]), null);
  assert.equal(parseCurriculum([CURRICULUM_HEADER, ["X9", "1週目", "施術者", "a", "x"]]), null); // 知らないクラスは読まない
});

test("並び順でソートし、追加は最後・同じIDは置き換え", () => {
  const rows = [MANUAL_HEADER, ["G1", "方針", "", "", "b", "B", "", "", 2], ["G1", "方針", "", "", "a", "A", "", "", 1]];
  const list = parseManual(rows);
  assert.deepEqual(list.map((m) => m.id), ["a", "b"]);
  const added = upsert(list, { ...list[0], id: "c", title: "C", order: 0 }, "社長", "2026-11-05 10:00");
  assert.deepEqual(added.map((m) => m.id), ["a", "b", "c"]);
  assert.equal(added[2].order, 3);
  const replaced = upsert(added, { ...added[0], title: "A2", order: 0 }, "社長", "t");
  assert.equal(replaced[0].title, "A2");
  assert.equal(replaced[0].order, 1);
  assert.deepEqual(removeById(replaced, "b").map((m) => m.id), ["a", "c"]);
});

test("入力チェック", () => {
  const ok = validateManualItem({ grade: "G2", area: "施術者", measure: "定量", id: "g2_x", title: "  テスト ", evalId: "personal_sales" });
  assert.equal(ok.title, "テスト");
  assert.throws(() => validateManualItem({ grade: "G9", area: "方針", id: "x", title: "t" }), /クラス/);
  assert.throws(() => validateManualItem({ grade: "G2", area: "施術者", id: "x", title: "t" }), /定量/);
  assert.throws(() => validateManualItem({ grade: "G2", area: "理念", id: "x", title: "t" }), /共通/);
  assert.throws(() => validateManualItem({ grade: "G2", area: "方針", id: "日本語", title: "t" }), /項目ID/);
  // 方針には定量／定性・評価項目を付けない
  const pol = validateManualItem({ grade: "G2", area: "方針", measure: "定量", evalId: "pc", id: "p", title: "t" });
  assert.equal(pol.measure, "");
  assert.equal(pol.evalId, "");
  assert.equal(validateStep({ grade: "G1", id: "s1", title: "x", area: "?" }).area, "施術者");
  assert.throws(() => validateStep({ grade: COMMON, id: "s1", title: "x" }), /クラス/);
});

test("読んだ記録：更新後は「更新あり」", () => {
  const manual = [{ ...DEFAULT_MANUAL[0], grade: COMMON, at: "2026-11-05 10:00" }];
  const reads = parseReads([["氏名key"], ["山田", "山田", COMMON, "2026-11-04 09:00"], ["山田", "山田", "G1", "2026-11-06 09:00"]]);
  assert.equal(readStatus(reads, manual, "山田", COMMON).state, "更新あり");
  assert.equal(readStatus(reads, manual, "山田", "G1").state, "確認済");
  assert.equal(readStatus(reads, manual, "佐藤", "G1").state, "未確認");
});

test("カリキュラムの進み具合と、合格をつけられる人", () => {
  const prog = parseProgress([["h"], ["山田", "山田", "n_rinen", "合格", "院長", "t", ""], ["山田", "山田", "n_rules", "練習中", "", "t", ""], ["山田", "山田", "zzz", "合格"]]);
  const s = curriculumProgress(DEFAULT_CURRICULUM, prog.get("山田"), "G1");
  assert.equal(s.passed, 1);
  assert.equal(s.practicing, 1);
  assert.equal(s.rate, Math.round(100 / s.total));
  const newbie = { key: "山田", grade: "G1", clinics: ["茨木"] };
  assert.equal(canCheck({ personKey: "副", grade: "G3", clinics: ["茨木"], scope: "self" }, false, newbie), true);
  assert.equal(canCheck({ personKey: "副", grade: "G3", clinics: ["枚方"], scope: "self" }, false, newbie), false);
  assert.equal(canCheck({ personKey: "一般", grade: "G2", clinics: ["茨木"], scope: "self" }, false, newbie), false);
  assert.equal(canCheck({ personKey: "山田", grade: "G1", clinics: ["茨木"], scope: "self" }, false, newbie), false);
  assert.equal(canCheck({ personKey: "GM", scope: "all" }, false, newbie), true);
  assert.equal(canCheck({ personKey: "副", grade: "G3", clinics: ["茨木"], scope: "self" }, false, { key: "院長", grade: "G4", clinics: ["茨木"] }), false);
});

test("マニュアルのクラス：スペシャリストは同じ段、短時間・受付などは一般スタッフ", () => {
  assert.equal(manualGradeOf("S2"), "G4");
  assert.equal(manualGradeOf("G5"), "G5");
  assert.equal(manualGradeOf("-R"), "G2");
});

test("評価項目の目標をマニュアル項目に付ける", () => {
  const m = attachEval(DEFAULT_MANUAL, items).find((x) => x.id === "g4_labor");
  assert.equal(m.eval.target, 42);
  assert.equal(m.eval.direction, "以下");
  assert.equal(attachEval(DEFAULT_MANUAL, items).find((x) => x.id === "c_greeting").eval.kind, "基本");
});

import { DEFAULT_BEHAVIOR, BEHAVIOR_CHAPTERS, parseBehavior, behaviorRows, parseScripts, scriptsText, validateBehavior, chaptersOf } from "../lib/behavior-manual.js";

test("行動マニュアル：初期値はIDが重複せず、全章に項目があり、シートに書いて読み直すと同じ", () => {
  const ids = DEFAULT_BEHAVIOR.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(chaptersOf(DEFAULT_BEHAVIOR), BEHAVIOR_CHAPTERS);
  for (const b of DEFAULT_BEHAVIOR) assert.ok(b.actions.length + b.rules.length + b.scripts.length > 0, b.id);
  const back = parseBehavior(behaviorRows(DEFAULT_BEHAVIOR));
  assert.equal(back.length, DEFAULT_BEHAVIOR.length);
  for (let i = 0; i < back.length; i++) {
    const { by, at, ...a } = back[i];
    const { by: _b, at: _a, ...e } = DEFAULT_BEHAVIOR[i];
    assert.deepEqual(a, e, DEFAULT_BEHAVIOR[i].id);
  }
});

test("行動マニュアル：トーク例は「■見出し」で区切る・入力チェック", () => {
  const s = parseScripts("■A\n一行目\n二行目\n■B\nbbb");
  assert.deepEqual(s, [{ label: "A", text: "一行目\n二行目" }, { label: "B", text: "bbb" }]);
  assert.deepEqual(parseScripts(scriptsText(s)), s);
  const v = validateBehavior({ id: "x1", title: "電話", chapter: "5. 電話・受付対応", area: "?", actions: "・3コール以内\n\n⭐メモを残す", scripts: "本文だけ" });
  assert.equal(v.area, "社会人");
  assert.deepEqual(v.actions, ["3コール以内", "メモを残す"]);
  assert.deepEqual(v.scripts, [{ label: "", text: "本文だけ" }]);
  assert.throws(() => validateBehavior({ id: "x1", title: "", chapter: "a" }), /タイトル/);
});
