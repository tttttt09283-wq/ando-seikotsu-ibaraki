// node --test test/*.test.js で実行（架空のデータ）
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ITEMS, EVALUATED_GRADES, itemsFor, itemSheetRows, parseItemSheet, numberPoints, scoreMonth, parseRecords, buildRecordRows,
  RECORD_HEADER, halfMonthKeys, parseMonthKey, superiorOf, canEvaluate,
} from "../lib/evaluation.js";

test("every grade's items (incl. common basics) total 100 points, PC is required from G4 up", () => {
  for (const grade of EVALUATED_GRADES) {
    const items = itemsFor(DEFAULT_ITEMS, grade);
    assert.equal(items.reduce((a, i) => a + i.points, 0), 100, grade);
    assert.equal(items.filter((i) => i.kind === "基本").reduce((a, i) => a + i.points, 0), 15, grade);
    const pc = items.find((i) => i.id === "pc");
    assert.ok(pc, `${grade} has PC item`);
    assert.equal(pc.required, ["G4", "G5", "G6"].includes(grade), grade);
  }
});

test("item sheet round-trips", () => {
  assert.deepEqual(parseItemSheet(itemSheetRows()), DEFAULT_ITEMS);
});

test("number points: 以上 is capped ratio, 以下 drops to 0 at target+10", () => {
  const up = { points: 10, target: 100, direction: "以上" };
  assert.equal(numberPoints(up, 50), 5);
  assert.equal(numberPoints(up, 150), 10);
  const down = { points: 20, target: 42, direction: "以下" };
  assert.equal(numberPoints(down, 40), 20);
  assert.equal(numberPoints(down, 47), 10);
  assert.equal(numberPoints(down, 60), 0);
});

test("scoreMonth: behavior = points x score/5, rank only when complete, required flag", () => {
  const items = itemsFor(DEFAULT_ITEMS, "G4");
  const values = { clinic_budget: 100, clinic_labor: 40, new_count: 10, new_close: 70, new_sales: 200000, clinic_continue_rate: 75 };
  const scores = { pl: 5, shift: 5, claim: 5, develop: 5, pc: 2,
    basic_greeting: 5, basic_appearance: 5, basic_punctual: 2, basic_hourensou: 5, basic_rules: 5 };
  const r = scoreMonth(items, values, scores);
  assert.equal(r.total, 92.2); // PC 配点10 × 2/5（-6）、時間厳守 配点3 × 2/5（-1.8）
  assert.equal(r.rank, "S");
  assert.deepEqual(r.requiredMissed, ["PC業務（必須）"]);
  assert.deepEqual(r.basicIssues, ["時間厳守・無遅刻無欠勤"]);
  const partial = scoreMonth(items, values, {});
  assert.equal(partial.rank, null);
  assert.equal(partial.complete, false);
});

test("records: new rows are appended, existing rows are updated in place", () => {
  const person = { name: "山田 太郎", key: "山田太郎", grade: "G2", clinics: ["A"] };
  const items = itemsFor(DEFAULT_ITEMS, "G2");
  const first = buildRecordRows({ monthKey: "2027-01", person, items, values: { continue_rate: 75 }, scores: { pc: 4 }, comment: "ok", evaluator: "上司", now: "t", existing: null });
  assert.equal(first.updates.length, 0);
  assert.equal(first.appends.length, items.length + 2);
  const sheet = [RECORD_HEADER, ...first.appends];
  const map = parseRecords(sheet);
  const rec = map.get("2027-01|山田太郎");
  assert.equal(rec.values.continue_rate, 75);
  assert.equal(rec.scores.pc, 4);
  assert.equal(rec.comment, "ok");
  const second = buildRecordRows({ monthKey: "2027-01", person, items, values: {}, scores: { pc: 5 }, comment: "", evaluator: "上司", now: "t2", existing: rec });
  assert.equal(second.appends.length, 0);
  assert.equal(second.updates.length, items.length + 2);
});

test("month helpers", () => {
  assert.deepEqual(parseMonthKey("2027-01"), { year: 2027, month: 1, fiscalYear: 2026 });
  assert.deepEqual(halfMonthKeys("2027-03"), ["2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06"]);
  assert.equal(parseMonthKey("2027-13"), null);
});

test("direct superior: staff→院長, 院長→BM, BM→GM; no 院長 → BM", () => {
  const model = {
    people: [
      { key: "gm", name: "GM", grade: "G6", clinics: ["A"] },
      { key: "bm", name: "BM", grade: "G5", clinics: ["B"] },
      { key: "mgr", name: "院長", grade: "G4", clinics: ["A"] },
      { key: "s1", name: "スタッフA", grade: "G2", clinics: ["A"] },
      { key: "s2", name: "スタッフB", grade: "G1", clinics: ["B"] },
    ],
    blocks: [{ bmName: "BM", clinics: ["A", "B"], personKey: "bm" }],
  };
  const p = (k) => model.people.find((x) => x.key === k);
  assert.equal(superiorOf(model, p("s1")).key, "mgr");
  assert.equal(superiorOf(model, p("s2")).key, "bm");
  assert.equal(superiorOf(model, p("mgr")).key, "bm");
  assert.equal(superiorOf(model, p("bm")).key, "gm");
  assert.equal(superiorOf(model, p("gm")), null);
  assert.equal(canEvaluate(model, { personKey: "mgr", grade: "G4" }, false, p("s1")), true);
  assert.equal(canEvaluate(model, { personKey: "s1", grade: "G2" }, false, p("s1")), false);
  assert.equal(canEvaluate(model, { personKey: "mgr", grade: "G4" }, false, p("s2")), false);
});

test("validateItems: cleans input, keeps ids unique, requires target for 数値, 共通 is always 基本", async () => {
  const { validateItems } = await import("../lib/evaluation.js");
  const list = validateItems("G2", [
    { kind: "行動", id: "a", label: " 報連相 ", points: "5", note: "内容" },
    { kind: "数値", id: "a", label: "成約率", points: 10, target: "60%", unit: "%", direction: "以上", auto: "bogus" },
  ]);
  assert.equal(list[0].label, "報連相");
  assert.equal(list[0].points, 5);
  assert.notEqual(list[1].id, "a"); // 重複IDは振り直し
  assert.equal(list[1].target, 60);
  assert.equal(list[1].auto, "");
  assert.throws(() => validateItems("G2", [{ kind: "数値", label: "x", points: 5 }]), /目標値/);
  assert.throws(() => validateItems("G2", [{ kind: "行動", label: "", points: 5 }]), /空/);
  assert.throws(() => validateItems("G9", []), /クラス/);
  assert.equal(validateItems("共通", [{ kind: "数値", label: "挨拶", points: 3 }])[0].kind, "基本");
});

test("records keep the total saved at the time", () => {
  const person = { name: "山田 太郎", key: "山田太郎", grade: "G2", clinics: ["A"] };
  const items = itemsFor(DEFAULT_ITEMS, "G2");
  const { appends, result } = buildRecordRows({ monthKey: "2027-01", person, items, values: {}, scores: { pc: 5 }, comment: "", evaluator: "上司", now: "t", existing: null });
  const rec = parseRecords([RECORD_HEADER, ...appends]).get("2027-01|山田太郎");
  assert.equal(rec.storedTotal, result.total);
});

test("new-patient sheet: columns by header, nail cases excluded, surname matching, metrics", async () => {
  const { parseNewPatients, newPatientMetrics, parseSheetDate } = await import("../lib/new-patients.js");
  const people = [{ key: "山田太郎", name: "山田 太郎" }, { key: "佐藤花子", name: "佐藤 花子" }];
  const sheets = {
    "A院": [
      [],
      ["来院日（必須）", "問い合わせ経路", "成約金額（必須）", "症状（必須）", "初回施術担当者", "初回窓口金額", "自費加入", "通院"],
      [46296, "電話", 50000, "腰痛", "山田　太郎", 3000, "○", "○"],   // 2026-10-01（シリアル値）
      ["2026/10/15", "電話", "", "肩", "山田", 2000, "", "◯"],
      ["2026/10/20", "電話", "", "巻き爪", "山田", 1000, "", ""],      // 爪は除外
      ["2026/09/30", "電話", "", "膝", "佐藤", 4000, "", ""],
      ["2026/10/02", "電話", "", "膝", "応援", 4000, "", ""],
    ],
  };
  assert.deepEqual(parseSheetDate(46296), { year: 2026, month: 10 });
  const np = parseNewPatients(sheets, people);
  const m = newPatientMetrics(np.byPerson.get("山田太郎")["2026-10"]);
  assert.deepEqual(m, { new_count: 2, new_close: 50, new_sales: 55000, new_first_avg: 2500, new_continue: 100 });
  assert.equal(np.byPerson.get("佐藤花子")["2026-09"].count, 1);
  assert.equal(np.byClinic.get("A")["2026-10"].count, 3);
  assert.deepEqual(np.unmatched, ["応援"]);
});
