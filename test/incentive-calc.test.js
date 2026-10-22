// node --test test/  で実行（実データではなく架空のデータ）
import test from "node:test";
import assert from "node:assert/strict";
import { buildModel, resolveViewer, filterModelForViewer, canonClinic, clinicsAt, evalGradeAt, evalAsAt, salaryChange, parseEvaluations } from "../lib/incentive-calc.js";

const clinicRows = [
  [],
  ["拠点", "項目", "7月", "8月", "9月", "10月", "11月", "12月", "合計", "１月"],
  ["A院", "予算", 1000000, 1000000, 1000000, 1000000, 1000000, 1000000, "", 1000000],
  ["", "実績", 1200000, 900000, 1100000],
  ["B院", "予算", 1000000, 1000000, 1000000, 1000000, 1000000, 1000000],
  ["", "実績", 800000, 800000, 800000],
];
const personalRows = [
  ["", "保険請求金額"],
  ["", "名前", "項目", "7月", "8月", "9月", "10月", "11月", "12月", "合計"],
  ["", "山田 太郎", "予算"], ["", "", "実績", 900000, 1000000, 1100000], ["", "", "人数"], ["", "", "請求金額", 200000, 200000, 200000],
  ["", "", "合計", 1100000, 1200000, 1300000, 0, 0, 0],
  ["", "佐藤 花子", "予算"], ["", "", "実績", 500000, 600000, 600000], ["", "", "人数"], ["", "", "請求金額", 0, 0, 0],
  ["", "", "合計", 500000, 600000, 600000, 0, 0, 0],
];
const bmFormulaRows = [["BM名", "項目", "7月"], ["鈴木", "予算", "='院'!C3+'院'!C5"], ["伊藤", "予算", "='院'!C5"]];
const policyRows = [["店舗名", "体制", "月間売上実績", "実績固定人件費"], ["A院", "4名", 0, 300000], ["B院", "3名", 0, 300000]];
const payrollRows = [["月", "会社売上", "支給合計額"], ["7月", 2000000, 500000]];
const evaluationRows = [
  ["所属院", "氏名", "等級", "役職", "総合評価点", "評価ランク"],
  ["A院", "鈴木 一郎", "G5", "BM（ブロックマネージャー）", 70, "B"],
  ["A院", "高橋 次郎", "G4", "院長", 80, "A"],
  ["A院", "山田 太郎", "G2", "一般スタッフ", 75, "B"],
  ["B院", "佐藤 花子", "G3", "副院長 / チーフ（★新設）", 40, "D"],
  ["B院", "伊藤 三郎", "G6", "GM（ゼネラルマネージャー）", 90, "S"],
];
const model = buildModel({ clinicRows, personalRows, bmFormulaRows, policyRows, payrollRows, evaluationRows }, new Date("2026-10-01"));
const person = (n) => model.people.find((p) => p.name === n);

test("clinic name normalization", () => {
  assert.equal(canonClinic("枚方本院"), "枚方");
  assert.equal(canonClinic("7店舗目（新店）"), "香里園");
  assert.equal(canonClinic("交野院"), "交野");
});

test("latest month and halves", () => {
  assert.equal(model.latestMonth, 9);
  assert.deepEqual(model.halves[0].elapsed, [7, 8, 9]);
});

test("manager: 5万 per achieved month", () => {
  const inc = person("高橋 次郎").incentives.find((i) => i.half === "H1");
  assert.equal(inc.earned, 100000); // 7月・9月達成
  assert.equal(inc.max, 250000);
});

test("staff: monthly average of 窓口+請求 >= 100万", () => {
  assert.equal(person("山田 太郎").incentives.find((i) => i.half === "H1").projected, 100000);
  assert.equal(person("佐藤 花子").incentives.find((i) => i.half === "H1").projected, 0);
});

test("bm block from formula refs", () => {
  assert.deepEqual(model.blocks[0].clinics, ["A", "B"]);
  const inc = person("鈴木 一郎").incentives.find((i) => i.type === "bm" && i.half === "H1");
  assert.equal(inc.projected, 0); // 累計 560万 / 予算 600万
});

test("GM gets only the GM incentive even when listed as BM", () => {
  assert.deepEqual([...new Set(person("伊藤 三郎").incentives.map((i) => i.type))], ["gm"]);
});

test("ladder: G3 demotion streak", () => {
  const item = person("佐藤 花子").ladder.items[0];
  assert.equal(item.kind, "demotion");
  assert.equal(item.ok, false); // 3ヶ月連続65万未満
});

test("42% cap uses payroll x1.15 and estimates missing months", () => {
  const h1 = model.company[0];
  assert.equal(h1.months[0].labor, 500000 * 1.15);
  assert.equal(h1.months[1].laborEstimated, true);
  assert.ok(h1.payableRatio >= 0 && h1.payableRatio <= 1);
});

test("visibility by role", () => {
  const admin = resolveViewer(model, { name: "", role: "admin" });
  assert.equal(admin.scope, "all");
  const mgr = resolveViewer(model, { name: "高橋", role: "staff" });
  assert.equal(mgr.scope, "clinic");
  const seen = filterModelForViewer(model, mgr);
  assert.equal(resolveViewer(model, { name: "伊藤 三郎", role: "staff" }).scope, "all");
  assert.equal(seen.company, null);
  assert.deepEqual(seen.people.map((p) => p.name).sort(), ["山田 太郎", "高橋 次郎"].sort()); // BMは見えない
  const staff = resolveViewer(model, { name: "佐藤 花子", role: "staff" });
  assert.equal(filterModelForViewer(model, staff).people.length, 1);
  assert.equal(resolveViewer(model, { name: "知らない人", role: "staff" }), null);
});

test("visible range per level: staff own only, 院長 own clinic, BM area, 社長/GM all", async () => {
  const { filterModelForViewer: f } = await import("../lib/incentive-calc.js");
  const staff = f(model, resolveViewer(model, { name: "佐藤 花子", role: "staff" }));
  assert.equal(staff.clinics.length, 0);
  assert.equal(staff.canSeeLabor, false);
  assert.deepEqual(staff.people.map((p) => p.name), ["佐藤 花子"]);
  const mgr = f(model, resolveViewer(model, { name: "高橋", role: "staff" }));
  assert.deepEqual(mgr.clinics.map((c) => c.name), ["A"]);
  assert.equal(mgr.canSeeLabor, true);
  assert.equal(mgr.canSeeSalary, false);
  assert.ok(mgr.people.every((p) => p.clinics.includes("A")));
  const gm = f(model, resolveViewer(model, { name: "伊藤 三郎", role: "staff" }));
  assert.equal(gm.canSeeSalary, true);
  assert.ok(gm.company);
});

test("10月からの異動・院長候補が月ごとに反映される", () => {
  const p = { clinics: ["香里園"], grade: "G3", clinicHistory: [{ clinics: ["大和田", "香里園"] }, { clinics: ["香里園"], from: "2026-10" }],
    evalAs: [{ grade: "G4", from: "2026-10", candidate: true }] };
  assert.deepEqual(clinicsAt(p, "2026-09"), ["大和田", "香里園"]);
  assert.deepEqual(clinicsAt(p, "2026-10"), ["香里園"]);
  assert.equal(evalGradeAt(p, "2026-09"), "G3");
  assert.equal(evalGradeAt(p, "2026-11"), "G4");
  assert.equal(evalAsAt(p, "2026-09"), null);
});

test("改定前・改定後の給与と増減がわかる", () => {
  const head = ["所属院", "氏名", "等級", "役職", "総合評価点", "評価ランク", "給与判定", "改定額", "改定後固定支給額", "役職適格判定", "賞与想定額", "最終決裁"];
  const [a, b, c] = parseEvaluations([head,
    ["枚方本院", "甲", "G2", "", 85, "A", "昇給", 7500, 307500, "", 0, ""],
    ["枚方本院", "乙", "G2", "", 40, "D", "降給検討", 0, 260000, "", 0, ""],
    ["枚方本院", "丙", "G2", "", 70, "B", "据置", 0, 280000, "", 0, ""]]);
  assert.equal(a.prevSalary, 300000);
  assert.equal(a.change, "up");
  assert.equal(b.change, "downReview");
  assert.equal(c.change, "keep");
  assert.equal(salaryChange(-5000, ""), "down");
  assert.equal(salaryChange(null, ""), null);
});
