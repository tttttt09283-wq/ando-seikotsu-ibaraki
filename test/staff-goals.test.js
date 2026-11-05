// node --test test/*.test.js で実行（架空のデータ）
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = {};
vm.runInNewContext(readFileSync(new URL("../staff-goals-logic.js", import.meta.url), "utf8"), ctx);
const SG = ctx.StaffGoals;
const plain = (v) => JSON.parse(JSON.stringify(v));

const payments = [
  // 1回目（新規）：保険はA(1)、自費の鍼はB(2)、物販はA
  { id: 1, booking_id: 10, patient_name: "架空 太郎", payment_date: "2026-11-01", staff_id: 1, insurance_staff_id: 1, insurance_amount: 1000, jifee_amount: 4000, total_amount: 5000,
    jifee_items: [{ label: "鍼", amount: 3000, staff_id: 2 }, { label: "物販：インソール", amount: 1000, staff_id: 1 }] },
  // 同じ予約の追加会計（客数は増えない）
  { id: 2, booking_id: 10, patient_name: "架空 太郎", payment_date: "2026-11-01", staff_id: 1, insurance_amount: 0, jifee_amount: 500, total_amount: 500, jifee_items: [] },
  // 2回目（再来）：担当Aのみ
  { id: 3, booking_id: 11, patient_name: "架空 太郎", payment_date: "2026-11-03", staff_id: 1, insurance_amount: 800, jifee_amount: 0, total_amount: 800, jifee_items: [] },
  // 期間外
  { id: 4, booking_id: 12, patient_name: "架空 花子", payment_date: "2026-10-30", staff_id: 2, insurance_amount: 0, jifee_amount: 5000, total_amount: 5000, jifee_items: [] },
  // 返金（Aの技術から引く。客数は数えない）
  { id: "refund_1", is_refund: true, booking_id: 11, patient_name: "架空 太郎", payment_date: "2026-11-04", staff_id: 1, total_amount: -300 },
];

test("担当ごとに技術・商品へ分け、同じ予約は1人と数える", () => {
  const rows = SG.summarize(payments, { from: "2026-11-01", to: "2026-11-05" });
  const a = rows.find((r) => r.staffId === 1);
  const b = rows.find((r) => r.staffId === 2);
  assert.equal(a.tech, 1000 + 500 + 800 - 300);
  assert.equal(a.goods, 1000);
  assert.equal(a.total, 3000);
  assert.equal(a.visits, 2);
  assert.equal(a.goodsVisits, 1);
  assert.equal(a.newVisits, 1);
  assert.equal(a.repeatVisits, 1);
  assert.equal(a.avg, 1500);
  assert.deepEqual(plain(b), { staffId: 2, total: 3000, tech: 3000, goods: 0, visits: 1, techVisits: 1, goodsVisits: 0, newVisits: 1, repeatVisits: 0, avg: 3000, techAvg: 3000, goodsAvg: 0 });
});

test("店舗で絞り込める", () => {
  const storeOf = (id) => (id === 11 ? 2 : 1);
  const rows = SG.summarize(payments, { from: "2026-11-01", to: "2026-11-05", storeId: 2, storeOfBooking: storeOf });
  assert.deepEqual(plain(rows.map((r) => [r.staffId, r.total])), [[1, 500]]);
});

test("順位：同じ値は同じ順位、売上比率は全体に占める割合", () => {
  const rows = SG.rank([{ staffId: 1, total: 100, visits: 2 }, { staffId: 2, total: 300, visits: 2 }, { staffId: 3, total: 100, visits: 1 }], "visits");
  assert.deepEqual(plain(rows.map((r) => [r.staffId, r.rank, r.share])), [[2, 1, 60], [1, 1, 20], [3, 3, 20]]);
});

test("商品の判定", () => {
  assert.equal(SG.isGoodsLabel("物販：室内サンダル"), true);
  assert.equal(SG.isGoodsLabel("フリーパス 3ヶ月"), false);
  assert.equal(SG.isGoodsLabel("鍼"), false);
});

test("達成率：多いほど良い／少ないほど良い", () => {
  assert.equal(SG.achievement(100, 80, "up"), 80);
  assert.equal(SG.achievement(10, 8, "down"), 100);
  assert.equal(SG.achievement(10, 12, "down"), 80);
  assert.equal(SG.achievement(100, null, "up"), null);
});

test("実績：自動の指標はサマリー、手入力は保存した値", () => {
  const row = { total: 50000, visits: 20 };
  assert.equal(SG.actualOf({ metric: "total" }, "2026-11", row), 50000);
  assert.equal(SG.actualOf({ metric: "manual", results: { "2026-11": { actual: 7 } } }, "2026-11", row), 7);
  assert.equal(SG.actualOf({ metric: "manual", results: {} }, "2026-11", row), null);
  assert.deepEqual(plain(SG.monthRange("2026-02")), { from: "2026-02-01", to: "2026-02-28" });
});
