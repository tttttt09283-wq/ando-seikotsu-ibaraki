import test from "node:test";
import assert from "node:assert/strict";
import { computeOverall, parseOverallRules, overallRuleRows, validateOverallRules, assessmentScore, halfIdOf, halfLabel, DEFAULT_OVERALL_RULES } from "../lib/overall.js";

test("総合評価：半期査定100点＋月次平均100点＝200点で給与・役職を判定", () => {
  const a = computeOverall({ assessment: 85, monthly: 90, monthlyCount: 6 });
  assert.equal(a.total, 175); assert.equal(a.rank, "A"); assert.equal(a.salary, "昇給"); assert.equal(a.raise, 7500); assert.equal(a.position, "昇格対象");
  const b = computeOverall({ assessment: 70, monthly: 65 });
  assert.equal(b.rank, "B"); assert.equal(b.salary, "現状維持"); assert.equal(b.position, "現状維持");
  const d = computeOverall({ assessment: 40, monthly: 50 });
  assert.equal(d.rank, "D"); assert.equal(d.salary, "降給"); assert.equal(d.position, "降格対象");
  // イベント加点で100を超えても月次は100点まで
  assert.equal(computeOverall({ assessment: 90, monthly: 108 }).total, 190);
});

test("総合評価：片方しか無いときは仮判定、どちらも無ければ判定なし", () => {
  const p = computeOverall({ assessment: 60, monthly: null });
  assert.equal(p.provisional, true); assert.equal(p.total, 120); assert.equal(p.rank, "C");
  const n = computeOverall({ assessment: null, monthly: null });
  assert.equal(n.total, null); assert.equal(n.rank, null);
});

test("総合評価の基準：シートから読み書き・検証", () => {
  const rows = overallRuleRows(DEFAULT_OVERALL_RULES);
  assert.deepEqual(parseOverallRules(rows), DEFAULT_OVERALL_RULES);
  const custom = validateOverallRules([{ rank: "A", min: "150", salary: "昇給", raise: "5000", position: "昇格対象" }, { rank: "B", min: 0, salary: "現状維持", raise: 0, position: "現状維持" }]);
  assert.equal(computeOverall({ assessment: 75, monthly: 75, rules: custom }).rank, "A");
  assert.throws(() => validateOverallRules([{ rank: "A", min: 10, salary: "昇給", position: "昇格対象" }]), /0/);
  assert.throws(() => validateOverallRules([{ rank: "A", min: 0, salary: "何か", position: "昇格対象" }]), /給与判定/);
});

test("半期査定点は兼務の院の平均、半期の名前", () => {
  assert.equal(assessmentScore({ evaluations: [{ score: 53 }, { score: 60 }] }), 56.5);
  assert.equal(assessmentScore({ evaluations: [] }), null);
  assert.equal(halfIdOf("2027-03"), "2027-H1"); assert.equal(halfIdOf("2026-10"), "2026-H2");
  assert.equal(halfLabel("2027-H1"), "2027年1〜6月");
});
