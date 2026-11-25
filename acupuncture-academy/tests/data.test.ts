import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allLessons, chapters, publishedLessons } from "@/data/curriculum";
import { pointMap, points } from "@/data/points";
import { cases } from "@/data/cases";
import { confluentPairs } from "@/data/eight-confluent";
import { sourceMap } from "@/data/sources";
import { meridianMap } from "@/data/meridians";
import { pointPositions, labelPlacements } from "@/components/figures/body-geometry";

const renderer = readFileSync(new URL("../src/components/figures/figure-renderer.tsx", import.meta.url), "utf8");

test("全10章があり、講義IDが重複しない", () => {
  assert.equal(chapters.length, 10);
  const ids = allLessons.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of chapters) for (const l of c.lessons) assert.equal(l.chapterId, c.id, l.id);
});

test("全10章37講がすべて公開されている", () => {
  assert.equal(allLessons.length, 37);
  assert.equal(publishedLessons.length, 37);
  for (const c of chapters) assert.ok(c.lessons.length >= 3, c.id);
});

test("小テストの正解の位置が偏っていない（すべて先頭にならない）", () => {
  const firsts = publishedLessons.flatMap((l) => l.quiz ?? []).filter((q) => q.type === "single");
  const atA = firsts.filter((q) => q.answer[0] === "a").length;
  assert.ok(atA / firsts.length < 0.6, `先頭が正解の割合 ${atA}/${firsts.length}`);
});

test("最初の講義は第1章第1講「経絡とは何か」", () => {
  assert.equal(publishedLessons[0].id, "c1-l1");
  assert.equal(publishedLessons[0].title, "経絡とは何か");
});

test("公開講義は5ステップすべての教材を持つ", () => {
  for (const l of publishedLessons) {
    assert.ok(l.explain?.length, `${l.id} explain`);
    assert.ok(l.figures?.length, `${l.id} figures`);
    assert.ok(l.clinical, `${l.id} clinical`);
    assert.ok((l.quiz?.length ?? 0) >= 5, `${l.id} quiz`);
    assert.ok(l.review?.keyPoints.length && l.review.cards.length, `${l.id} review`);
    assert.ok(l.sourceIds.length, `${l.id} sources`);
  }
});

test("図IDはすべて描画できる", () => {
  for (const l of publishedLessons)
    for (const b of [...(l.explain ?? []), ...(l.figures ?? [])])
      if (b.figureId) assert.ok(renderer.includes(`case "${b.figureId}"`), `${l.id}: ${b.figureId}`);
});

test("小テスト：IDが一意で、正解が選択肢に含まれ、参照経穴が辞典にある", () => {
  const ids = new Set<string>();
  for (const l of publishedLessons)
    for (const q of l.quiz ?? []) {
      assert.ok(!ids.has(q.id), `重複 ${q.id}`);
      ids.add(q.id);
      assert.ok(q.id.startsWith(`${l.id}-`), `${q.id} の接頭辞`);
      const opts = new Set(q.options.map((o) => o.id));
      assert.equal(opts.size, q.options.length, q.id);
      assert.ok(q.answer.length > 0, q.id);
      for (const a of q.answer) assert.ok(opts.has(a), `${q.id}: ${a}`);
      if (q.type === "single") assert.equal(q.answer.length, 1, q.id);
      for (const c of q.pointCodes ?? []) assert.ok(pointMap[c], `${q.id}: 経穴 ${c} が辞典にない`);
    }
});

test("経穴辞典：コード一意・経絡が存在・模式図の位置がある・出典が登録済み", () => {
  assert.equal(new Set(points.map((p) => p.code)).size, points.length);
  for (const p of points) {
    assert.ok(meridianMap[p.meridian], p.code);
    assert.ok(p.code.startsWith(p.meridian), `${p.code} と経絡 ${p.meridian}`);
    assert.ok(pointPositions[p.code], `${p.code} の位置`);
    assert.ok(p.safety.length && p.howToLocate.length && p.anatomy.length, p.code);
    for (const id of [...p.sourceIds, ...p.indications.flatMap((i) => i.sourceIds)]) assert.ok(sourceMap[id], `${p.code}: 出典 ${id}`);
  }
  for (const code of [...Object.keys(pointPositions), ...Object.keys(labelPlacements)]) assert.ok(pointMap[code], `位置データ ${code}`);
});

test("八脈交会穴の4組は辞典の経穴を参照する", () => {
  assert.equal(confluentPairs.length, 4);
  for (const p of confluentPairs) {
    assert.ok(pointMap[p.upper.code] && pointMap[p.lower.code], p.id);
    assert.equal(pointMap[p.upper.code].extraVessel, p.upper.vessel, p.id);
    assert.equal(pointMap[p.lower.code].extraVessel, p.lower.vessel, p.id);
  }
});

test("症例：7段階が決まった順序で、正解が選択肢に含まれる", () => {
  const order = ["redflag", "differential", "meridian", "pattern", "principle", "points", "evaluation"];
  assert.ok(cases.length >= 4);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  for (const c of cases) {
    assert.deepEqual(c.steps.map((s) => s.id), order, c.id);
    for (const s of c.steps) {
      const opts = new Set(s.options.map((o) => o.id));
      for (const a of s.answer) assert.ok(opts.has(a), `${c.id}/${s.id}: ${a}`);
      if (s.type === "single") assert.equal(s.answer.length, 1, `${c.id}/${s.id}`);
    }
  }
});
