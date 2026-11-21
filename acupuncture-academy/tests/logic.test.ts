import { test } from "node:test";
import assert from "node:assert/strict";
import { migrate } from "@/lib/repository/local";
import { scheduleAfter, isDue } from "@/lib/review";
import { addDays, weekStart } from "@/lib/dates";
import type { ReviewItem } from "@/lib/repository/types";

test("v1 の記録（c2-l1）を v2（c1-l1）へ移行する", () => {
  const v1 = {
    version: 1,
    lessons: { "c2-l1": { stepIndex: 4, status: "completed" } },
    quizAttempts: [{ id: "x", lessonId: "c2-l1", results: [{ questionId: "c2-l1-q2", correct: false }] }],
    reviewItems: {
      "question:c2-l1-q2": { id: "question:c2-l1-q2", refId: "c2-l1-q2", lessonId: "c2-l1" },
      "lesson:c2-l1": { id: "lesson:c2-l1", refId: "c2-l1", lessonId: "c2-l1" },
    },
    lastVisited: { lessonId: "c2-l1", at: "" },
  };
  const out = migrate(v1 as never) as never as typeof v1;
  assert.equal(out.version, 2);
  assert.ok(out.lessons["c1-l1" as "c2-l1"]);
  assert.equal(out.quizAttempts[0].lessonId, "c1-l1");
  assert.equal(out.quizAttempts[0].results[0].questionId, "c1-l1-q2");
  assert.deepEqual(Object.keys(out.reviewItems).sort(), ["lesson:c1-l1", "question:c1-l1-q2"]);
  assert.equal(out.lastVisited.lessonId, "c1-l1");
});

test("v2 の記録は変更しない（新しい c2-l1 を壊さない）", () => {
  const v2 = { version: 2, lessons: { "c2-l1": { stepIndex: 1 } } };
  assert.deepEqual(migrate(v2 as never), v2);
});

test("復習間隔：正解で 1→3→7→14→30 日、不正解で当日に戻る", () => {
  let item: ReviewItem = { id: "q", type: "question", refId: "q", lessonId: "l", label: "", box: 0, due: "2026-11-01", lapses: 0 };
  const today = "2026-11-01";
  const expected = [3, 7, 14, 30, 30];
  for (const days of expected) {
    item = scheduleAfter(item, true, today);
    assert.equal(item.due, addDays(today, days));
  }
  item = scheduleAfter(item, false, today);
  assert.equal(item.box, 0);
  assert.equal(item.due, today);
  assert.ok(isDue(item, today));
  assert.equal(item.lapses, 1);
});

test("日付ユーティリティ", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(weekStart("2026-11-22"), "2026-11-16"); // 日曜 → 月曜始まり
});
