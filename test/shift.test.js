// node --test test/*.test.js で実行（架空のデータ）
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = {};
vm.runInNewContext(readFileSync(new URL("../shift-logic.js", import.meta.url), "utf8"), ctx);
const S = ctx.ShiftLogic;
const plain = (v) => JSON.parse(JSON.stringify(v));

const stores = [{ id: 1, name: "あんど整骨院 茨木院" }, { id: 2, name: "香里園院" }];
const staff = [{ id: 10, name: "A" }, { id: 11, name: "B" }, { id: 12, name: "C" }, { id: 13, name: "D" }];
const staffStores = { 10: [1], 11: [1, 2], 12: [2] }; // D は所属院なし

test("月の日付", () => {
  const d = S.monthDates("2026-11");
  assert.equal(d.length, 30);
  assert.equal(d[0].date, "2026-11-01");
  assert.equal(d[0].day, 0); // 2026-11-01 は日曜
  assert.equal(S.shiftMonth("2026-12", 1), "2027-01");
  assert.equal(S.shiftMonth("2026-01", -1), "2025-12");
});

test("人数の数え方：出勤1・半日0.5・休み系0", () => {
  assert.equal(S.workUnits("出勤"), 1);
  assert.equal(S.workUnits("午前出勤"), 0.5);
  assert.equal(S.workUnits("午後出勤"), 0.5);
  ["休み", "有休", "振替", "祝振替", undefined].forEach((t) => assert.equal(S.workUnits(t), 0));
});

test("その日の種類：シフト表＞週固定シフト", () => {
  const weekly = S.weeklyMap([{ staff_id: 10, day_of_week: 3, is_working: false }]);
  assert.equal(S.dayType({}, weekly, 10, "2026-11-04"), "休み"); // 水曜
  assert.equal(S.dayType({}, weekly, 10, "2026-11-05"), "出勤");
  assert.equal(S.dayType({ "10_2026-11-04": "午前出勤" }, weekly, 10, "2026-11-04"), "午前出勤");
  assert.equal(S.dayType({ "10_2026-11-05": "へんな値" }, weekly, 10, "2026-11-05"), "出勤");
});

test("勤務院：その日の勤務院＞週固定の勤務院＞所属院", () => {
  const weekly = S.weeklyMap([{ staff_id: 10, day_of_week: 6, is_working: true, store_id: 2 }]);
  assert.equal(S.workStore({}, weekly, staffStores, 10, "2026-11-05"), 1); // 木曜→所属院
  assert.equal(S.workStore({}, weekly, staffStores, 10, "2026-11-07"), 2); // 土曜→週固定で香里園
  assert.equal(S.workStore({ "10_2026-11-07": 1 }, weekly, staffStores, 10, "2026-11-07"), 1);
  assert.equal(S.workStore({}, {}, staffStores, 13, "2026-11-07"), null);
  assert.equal(S.homeStore(staffStores, 11), 1);
});

test("必要人数：平日・土曜・日曜祝日", () => {
  const req = S.normRequired({ 1: { weekday: 3, sat: "4", sun: -1 }, 2: null });
  assert.deepEqual(plain(req), { 1: { weekday: 3, sat: 4, sun: 0 }, 2: { weekday: 0, sat: 0, sun: 0 } });
  assert.equal(S.requiredOn(req, 1, "2026-11-05", new Set()), 3);
  assert.equal(S.requiredOn(req, 1, "2026-11-07", new Set()), 4);
  req[1].sun = 2;
  assert.equal(S.requiredOn(req, 1, "2026-11-23", new Set(["2026-11-23"])), 2); // 祝日
  assert.equal(S.requiredOn(req, 9, "2026-11-05"), 0);
});

test("1か月の集計：院別人数・応援・不足日・休診日", () => {
  const shifts = {
    "10_2026-11-02": "休み",
    "11_2026-11-02": "午後出勤",
    "12_2026-11-03": "有休",
  };
  const storeOverrides = { "11_2026-11-03": 2 }; // B は 11/3 だけ香里園へ応援
  const required = S.normRequired({ 1: { weekday: 2, sat: 2, sun: 2 } });
  const closed = new Set(["1_2026-11-01"]); // 茨木は 11/1 休診
  const r = S.buildMonth({ month: "2026-11", staff, stores, shifts, storeOverrides, weekly: {}, staffStores, required, holidays: new Set(), closed });

  // 11/2：茨木は A 休み・B 午後のみ → 0.5人
  assert.equal(r.perStore[1]["2026-11-02"], 0.5);
  // 11/3：茨木は A のみ、香里園は C 有休・B 応援 → 1人
  assert.equal(r.perStore[1]["2026-11-03"], 1);
  assert.equal(r.perStore[2]["2026-11-03"], 1);
  assert.deepEqual(plain(r.perStoreStaff[2]["2026-11-03"]), [11]);
  assert.equal(r.cells["11_2026-11-03"].away, true);
  // 所属院のない D は「未設定」
  assert.equal(r.unassigned["2026-11-03"], 1);
  assert.equal(r.total["2026-11-03"], 3);
  // 不足日：11/1 は休診なので数えない。11/2・11/3 は2人に届かない
  const shortDates = r.shortages.filter((x) => x.storeId === 1).map((x) => x.date);
  assert.deepEqual(plain(shortDates), ["2026-11-02", "2026-11-03"]);
  assert.equal(r.storeSummary[1].openDays, 29);
  // スタッフ別
  assert.equal(r.staffSummary[10].off, 1);
  assert.equal(r.staffSummary[11].units, 29.5);
  assert.equal(r.staffSummary[11].away, 1);
  assert.equal(r.staffSummary[12].paid, 1);
});

test("院のシフト表に出す人・全社のグループ分け", () => {
  const r = S.buildMonth({ month: "2026-11", staff, stores, shifts: {}, storeOverrides: { "10_2026-11-10": 2 }, weekly: {}, staffStores, required: {} });
  const k = S.staffForStore(r, 2, staff, staffStores);
  assert.deepEqual(plain(k.own.map((s) => s.id)), [12]);
  assert.deepEqual(plain(k.help.map((s) => s.id)), [10]);
  const g = S.groupByHome(staff, stores, staffStores);
  assert.deepEqual(plain(g.map((x) => [x.storeId, x.staff.map((s) => s.id)])), [[1, [10, 11]], [2, [12]], [null, [13]]]);
});

test("休暇の残りの増減", () => {
  let h = { 10: { 有休残: 5, 振替残: 0, 祝振替残: 0 } };
  h = S.adjustBalance(h, 10, "出勤", "有休");
  assert.equal(h[10].有休残, 4);
  h = S.adjustBalance(h, 10, "有休", "振替");
  assert.equal(h[10].有休残, 5);
  assert.equal(h[10].振替残, 0); // 0 未満にはしない
  assert.equal(S.adjustBalance({}, 11, "出勤", "有休")[11].有休残, 9);
});

test("院名の短縮・人数表示・CSV", () => {
  assert.equal(S.shortStoreName("あんど整骨院 茨木院"), "茨木");
  assert.equal(S.shortStoreName("香里園駅前院"), "香里園");
  assert.equal(S.fmtUnits(2), "2");
  assert.equal(S.fmtUnits(2.5), "2.5");
  const r = S.buildMonth({ month: "2026-11", staff: [staff[0]], stores, shifts: { "10_2026-11-01": "休み" }, weekly: {}, staffStores, required: {} });
  const csv = S.toCsv(r, [staff[0]], stores).split("\n");
  assert.equal(csv.length, 2);
  assert.ok(csv[1].startsWith("A,休み,出勤(茨木)"));
  assert.ok(csv[1].endsWith(",29,1,0"));
});
