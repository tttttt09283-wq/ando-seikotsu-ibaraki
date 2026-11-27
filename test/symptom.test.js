// node --test test/*.test.js で実行（架空のデータ）
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = {};
vm.runInNewContext(readFileSync(new URL("../symptom-logic.js", import.meta.url), "utf8"), ctx);
const S = ctx.SymptomLogic;

test("データ：候補の部位・重みの特徴・検査がそろっている", () => {
  const regionIds = new Set(S.REGIONS.map((r) => r.id));
  const factorIds = new Set(S.FACTORS.flatMap((g) => g.items.map((i) => i.id)));
  for (const c of S.CONDITIONS) {
    assert.ok(regionIds.has(c.region), `${c.id} の部位`);
    for (const k of Object.keys(c.w)) assert.ok(factorIds.has(k), `${c.id} の特徴 ${k}`);
    assert.ok(c.tests.length > 0, `${c.id} の検査`);
  }
  // どの部位にも候補がある
  for (const r of S.REGIONS) assert.ok(S.CONDITIONS.some((c) => c.region === r.id), r.id);
});

test("ぎっくり腰：急に・重い物で → 1位がぎっくり腰、柔整の保険の目安", () => {
  const r = S.evaluate({ region: "low_back", factors: ["sudden", "lifting", "move", "flex"] });
  assert.equal(r.candidates[0].id, "acute_lbp");
  assert.equal(r.urgent, false);
  assert.ok(r.insurance.some((x) => x.startsWith("柔整の保険（健康保険）")));
});

test("間欠性跛行・60代・反らすと痛い → 脊柱管狭窄症、鍼灸保険の目安", () => {
  const r = S.evaluate({ region: "low_back", factors: ["walk_rest", "age_old", "extend", "numb"] });
  assert.equal(r.candidates[0].id, "stenosis");
  assert.ok(r.insurance.some((x) => x.startsWith("鍼灸の保険")));
});

test("五十肩：背中に手が回らない・夜間痛 → 五十肩", () => {
  const r = S.evaluate({ region: "shoulder", factors: ["behind_back", "night_ache", "age_mid"] });
  assert.equal(r.candidates[0].id, "frozen");
});

test("危険なサインがあれば急ぐ（候補があっても）", () => {
  const r = S.evaluate({ region: "low_back", factors: ["radiate", "numb"], redFlags: ["rf_bladder"] });
  assert.equal(r.urgent, true);
  assert.equal(r.redFlags[0].id, "rf_bladder");
  const t = S.summaryText({ region: "low_back", factors: ["radiate", "numb"] }, r);
  assert.ok(t.includes("危険なサイン") && t.includes("診断ではありません"));
});

test("当てはまる特徴がなければ候補なし・慢性は柔整の保険の対象外", () => {
  assert.equal(S.evaluate({ region: "knee", factors: [] }).candidates.length, 0);
  const r = S.evaluate({ region: "low_back", factors: ["chronic", "stiff", "desk"] });
  assert.equal(r.candidates[0].id, "chronic_lbp");
  assert.ok(!r.insurance.some((x) => x.startsWith("柔整の保険（健康保険）")));
});
