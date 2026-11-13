// node --test test/*.test.js で実行（架空のデータ）
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = {};
vm.runInNewContext(readFileSync(new URL("../attendance-logic.js", import.meta.url), "utf8"), ctx);
const A = ctx.Attendance;
const plain = (v) => JSON.parse(JSON.stringify(v));
// 日本時間の「日付 時刻」→ ISO
const jst = (ds, hm) => new Date(`${ds}T${hm}:00+09:00`).toISOString();

test("日本時間の HH:MM", () => {
  assert.equal(A.hmJst("2026-11-12T23:05:00Z"), "08:05");
  assert.equal(A.hmJst(null), "");
});

test("休日＝土日・祝日（臨時休業のメモで判定）", () => {
  const h = A.holidaySetFrom([{ date: "2026-11-23", memo: "祝日（勤労感謝の日）9-18営業" }, { date: "2026-11-13", memo: "っっっr" }]);
  assert.equal(A.isHolidayDate("2026-11-23", h), true);  // 月曜の祝日
  assert.equal(A.isHolidayDate("2026-11-14", h), true);  // 土曜
  assert.equal(A.isHolidayDate("2026-11-13", h), false); // 金曜（祝日ではないメモ）
});

test("早朝：平日は9:15、休日は8:15より前", () => {
  const h = new Set(["2026-11-23"]);
  assert.equal(A.isEarly("2026-11-13", jst("2026-11-13", "09:14"), {}, h), true);
  assert.equal(A.isEarly("2026-11-13", jst("2026-11-13", "09:15"), {}, h), false);
  assert.equal(A.isEarly("2026-11-14", jst("2026-11-14", "08:14"), {}, h), true);
  assert.equal(A.isEarly("2026-11-14", jst("2026-11-14", "09:00"), {}, h), false);
  assert.equal(A.isEarly("2026-11-23", jst("2026-11-23", "08:30"), {}, h), false); // 祝日は休日の基準
  // 設定で時刻を変えられる
  assert.equal(A.isEarly("2026-11-13", jst("2026-11-13", "09:20"), { earlyWeekday: "09:30" }, h), true);
  // おかしな設定は初期値に戻す
  assert.equal(A.normRules({ earlyWeekday: "25:00", breakMinMinutes: -3 }).earlyWeekday, "09:15");
  assert.equal(A.normRules({ breakMinMinutes: -3 }).breakMinMinutes, 45);
});

test("休憩なし：実働6時間超で休憩45分未満なら理由が必要", () => {
  const base = { date: "2026-11-13", clock_in: jst("2026-11-13", "10:00"), clock_out: jst("2026-11-13", "19:00") };
  assert.equal(A.needsBreakReason({ ...base, breaks: [] }, {}), true);
  assert.equal(A.needsBreakReason({ ...base, breaks: [{ start: jst("2026-11-13", "13:00"), end: jst("2026-11-13", "13:30") }] }, {}), true);
  assert.equal(A.needsBreakReason({ ...base, breaks: [{ start: jst("2026-11-13", "13:00"), end: jst("2026-11-13", "14:00") }] }, {}), false);
  // 短い勤務は対象外・退勤前は判定しない
  assert.equal(A.needsBreakReason({ ...base, clock_out: jst("2026-11-13", "15:00"), breaks: [] }, {}), false);
  assert.equal(A.needsBreakReason({ ...base, clock_out: null, breaks: [] }, {}), false);
  // 終わっていない休憩は数えない
  assert.equal(A.breakMinutes({ breaks: [{ start: jst("2026-11-13", "13:00"), end: null }] }), 0);
  assert.equal(A.workMinutes({ ...base, breaks: [{ start: jst("2026-11-13", "13:00"), end: jst("2026-11-13", "14:00") }] }), 480);
});

test("出勤・退勤・出勤・退勤（1回目の休憩で分ける）", () => {
  const r = { clock_in: jst("2026-11-13", "10:00"), clock_out: jst("2026-11-13", "19:00"),
    breaks: [{ start: jst("2026-11-13", "16:00"), end: jst("2026-11-13", "16:30") }, { start: jst("2026-11-13", "13:00"), end: jst("2026-11-13", "14:00") }] };
  assert.deepEqual(plain(A.segments(r)), [{ in: "10:00", out: "13:00" }, { in: "14:00", out: "19:00" }]);
  assert.deepEqual(plain(A.segments({ clock_in: jst("2026-11-13", "10:00"), clock_out: null, breaks: [] })), [{ in: "10:00", out: "" }, { in: "", out: "" }]);
});

test("公休日（シフト表の休み）と振休の残り", () => {
  const weekly = [{ staff_id: 1, day_of_week: 4, is_working: false }]; // 木曜が休み
  const shifts = { "1_2026-11-13": "休み", "1_2026-11-19": "出勤", "1_2026-11-20": "有休" };
  // 2026年11月の木曜：5,12,19,26 → 19は出勤に変更、13（金）を休みに → 5,12,26,13 の4日
  assert.equal(A.publicHolidayCount(1, "2026-11", shifts, weekly), 4);
  assert.equal(A.furikaeLeft({ 有休残: 10, 振替残: 2, 祝振替残: 1 }), 3);
  assert.equal(A.furikaeLeft(undefined), 0);
});

test("1人・1か月の勤怠表：合計と、理由が未入力の数", () => {
  const holidays = new Set();
  const records = [
    { id: 1, staff_id: 1, date: "2026-11-13", clock_in: jst("2026-11-13", "09:00"), clock_out: jst("2026-11-13", "19:00"), breaks: [] },
    { id: 2, staff_id: 1, date: "2026-11-14", clock_in: jst("2026-11-14", "08:00"), clock_out: jst("2026-11-14", "12:00"), breaks: [], early_reason: "準備のため" },
    { id: 3, staff_id: 2, date: "2026-11-13", clock_in: jst("2026-11-13", "10:00"), clock_out: jst("2026-11-13", "12:00"), breaks: [] },
  ];
  const s = A.sheetFor(1, "2026-11", records, { holidays, rules: {} });
  assert.equal(s.rows.length, 30);
  assert.equal(s.days, 2);
  assert.equal(s.totalMinutes, 600 + 240);
  assert.equal(s.early, 2);
  assert.equal(s.noBreak, 1);
  assert.equal(s.missing, 1); // 13日：早朝と休憩なしの理由が未入力（記録単位で1件）
  const d13 = s.rows.find((r) => r.date === "2026-11-13").items[0];
  assert.deepEqual([d13.issues.earlyMissing, d13.issues.breakMissing], [true, true]);
  assert.equal(A.fmtMinutes(840), "14:00");
});
