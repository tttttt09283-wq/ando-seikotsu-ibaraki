import { test } from "node:test";
import assert from "node:assert/strict";
import { symptomGuides, assemble, rankPatterns } from "@/data/symptoms";
import { pointMap } from "@/data/points";
import { lessonMap } from "@/data/curriculum";
import { caseMap } from "@/data/cases";
import { najiPoints, slotIndexOfHour, ziwuSlots } from "@/data/ziwu";
import { flowOrder } from "@/data/meridians";

test("症状ガイド：ID一意、危険徴候3つ以上、証2つ以上、参照先が存在する", () => {
  assert.equal(new Set(symptomGuides.map((g) => g.id)).size, symptomGuides.length);
  for (const g of symptomGuides) {
    assert.ok(g.redFlags.length >= 3, g.id);
    assert.ok(g.patterns.length >= 2, g.id);
    assert.ok(g.evaluation.length >= 2, g.id);
    if (g.lessonId) assert.ok(lessonMap[g.lessonId], `${g.id}: ${g.lessonId}`);
    if (g.caseId) assert.ok(caseMap[g.caseId], `${g.id}: ${g.caseId}`);
    const recs = [...(g.regions ?? []).flatMap((r) => [...r.local, ...r.distal]), ...g.common.map((c) => c.rec), ...g.patterns.flatMap((p) => p.points)];
    for (const x of recs) assert.ok(pointMap[x.code], `${g.id}: ${x.code} が辞典にない`);
    for (const p of g.patterns) assert.ok(p.points.length && p.signs.length && p.principle, `${g.id}/${p.id}`);
    // どの部位・証を選んでも候補が1つ以上出る
    for (const r of [null, ...(g.regions ?? []).map((x) => x.id)])
      for (const p of g.patterns) assert.ok(assemble(g, r, p.id).length > 0, `${g.id} ${r} ${p.id}`);
  }
});

test("取穴候補：重複せず、理由がまとまる", () => {
  const g = symptomGuides.find((x) => x.id === "headache")!;
  const list = assemble(g, "occiput", "wind-cold");
  const codes = list.map((c) => c.code);
  assert.equal(new Set(codes).size, codes.length);
  const gb20 = list.find((c) => c.code === "GB20")!;
  assert.equal(gb20.role, "局所");
  assert.ok(gb20.reasons.length >= 2, "風池は局所と証の両方の理由を持つ");
});

test("所見から証の順位：一致数の多い順", () => {
  const g = symptomGuides.find((x) => x.id === "low-back")!;
  const ranked = rankPatterns(g, ["冷え・雨の日に悪化", "温めると楽", "夜間尿"]);
  assert.equal(ranked[0].pattern.id, "cold-damp");
  assert.equal(ranked[0].hits, 2);
});

test("子午流注：十二支の刻は流注の順で、寅＝肺・丑＝肝", () => {
  assert.equal(ziwuSlots.length, 12);
  const start = ziwuSlots.findIndex((s) => s.meridian === "LU");
  assert.equal(ziwuSlots[start].branch, "寅");
  for (let i = 0; i < 12; i++) assert.equal(ziwuSlots[(start + i) % 12].meridian, flowOrder[i]);
  assert.equal(ziwuSlots[slotIndexOfHour(2)].meridian, "LR");
  assert.equal(ziwuSlots[slotIndexOfHour(23)].meridian, "GB");
  assert.equal(ziwuSlots[slotIndexOfHour(0)].meridian, "GB");
  assert.equal(ziwuSlots[slotIndexOfHour(12)].meridian, "HT");
});

test("納支法：肺実は寅に尺沢を瀉し、肺虚は卯に太淵を補う（ほか代表例）", () => {
  const lu = najiPoints("LU");
  assert.equal(lu.drain.code, "LU5");
  assert.equal(lu.drain.slot.branch, "寅");
  assert.equal(lu.tonify.code, "LU9");
  assert.equal(lu.tonify.slot.branch, "卯");
  const lr = najiPoints("LR");
  assert.equal(lr.drain.code, "LR2"); // 木の子＝火＝行間
  assert.equal(lr.tonify.code, "LR8"); // 木の母＝水＝曲泉
  const st = najiPoints("ST");
  assert.equal(st.drain.code, "ST45"); // 土の子＝金＝厲兌
  assert.equal(st.tonify.code, "ST41"); // 土の母＝火＝解渓
  for (const s of ziwuSlots) {
    const n = najiPoints(s.meridian);
    assert.ok(pointMap[n.drain.code] && pointMap[n.tonify.code], s.meridian);
  }
});
