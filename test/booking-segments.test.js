// node --test test/*.test.js で実行（架空のデータ）
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = {};
vm.runInNewContext(readFileSync(new URL("../booking-segments.js", import.meta.url), "utf8"), ctx);
const BS = ctx.BookingSegments;
const pick = (s) => JSON.parse(JSON.stringify(s.map((x) => [x._seg || null, x.staff_id, x.time, x.duration])));

test("鍼灸の担当が無い・同じ人の予約は1つのまま", () => {
  const b = { id: 1, staff_id: 1, time: "10:00", duration: 20 };
  assert.equal(BS.segmentsOf(b).length, 1);
  assert.equal(BS.segmentsOf({ ...b, acu_staff_id: 1 }).length, 1);
});

test("柔整→鍼灸：柔整のあとに鍼灸の担当", () => {
  const b = { id: 1, staff_id: 1, time: "10:00", duration: 20, acu_staff_id: 4, acu_duration: 20, acu_order: "after" };
  assert.deepEqual(pick(BS.segmentsOf(b)), [["ju", 1, "10:00", 20], ["acu", 4, "10:20", 20]]);
  assert.deepEqual({ ...BS.visitRange(b) }, { start: 600, end: 640, minutes: 40 });
});

test("鍼灸→柔整：鍼灸が先、柔整はそのあと", () => {
  const b = { id: 2, staff_id: 1, time: "10:00", duration: 20, acu_staff_id: 4, acu_duration: 30, acu_order: "before" };
  assert.deepEqual(pick(BS.segmentsOf(b)), [["ju", 1, "10:30", 20], ["acu", 4, "10:00", 30]]);
});

test("まとめて展開（duration が無いときはメニューから）", () => {
  const list = [
    { id: 1, staff_id: 1, time: "10:00", menu: "鍼灸併用 3割 初診", acu_staff_id: 2 },
    { id: 2, staff_id: 3, time: "11:00", duration: 30 },
  ];
  const segs = BS.expand(list, (b) => (b.menu || "").includes("鍼灸") ? 20 : 30);
  assert.deepEqual(pick(segs), [["ju", 1, "10:00", 20], ["acu", 2, "10:20", 20], [null, 3, "11:00", 30]]);
  assert.equal(segs[1]._baseId, 1);
});
