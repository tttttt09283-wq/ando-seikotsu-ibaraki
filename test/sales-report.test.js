// node --test test/*.test.js で実行（架空のデータ）
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = {};
vm.runInNewContext(readFileSync(new URL("../sales-report-logic.js", import.meta.url), "utf8"), ctx);
const SR = ctx.SalesReport;
const plain = (v) => JSON.parse(JSON.stringify(v));

const pay = (id, booking, name, date, ins, items = [], method = "") => ({
  id, booking_id: booking, patient_name: name, payment_date: date, staff_id: 1, insurance_amount: ins,
  jifee_amount: items.reduce((a, i) => a + i.amount, 0), total_amount: ins + items.reduce((a, i) => a + i.amount, 0), jifee_items: items, payment_method: method,
});
const payments = [
  pay(1, 1, "架空 花子", "2026-06-01", 800, [], "現金:¥800"),
  pay(2, 2, "架空 花子", "2026-10-02", 800, [], "現金:¥800"),                                   // 前回から90日超 → ごぶさた
  pay(3, 3, "架空 太郎", "2026-10-03", 1100, [{ label: "鍼", amount: 3000 }, { label: "物販：コルセット", amount: 5500 }], "現金:¥1,100・カード:¥8,500"), // 新規
  pay(4, 4, "架空 太郎", "2026-10-10", 0, [], "現金:¥0"),                                       // 回数券の消化（¥0）→ 再来
  pay(5, 5, "架空 太郎", "2026-10-17", 1100, [], "PayPay:¥1,100"),                              // 固定
  { id: "refund_1", is_refund: true, booking_id: 5, patient_name: "架空 太郎", payment_date: "2026-10-20", staff_id: 1, total_amount: -1100, insurance_amount: -1100, jifee_amount: 0 },
];
const bookings = [
  { id: 3, patient_name: "架空 太郎", date: "2026-10-03", gender: "男性", age: 45, how_know: "チラシ①", insurance_rate: "3割", store_id: 1 },
  { id: 2, patient_name: "架空 花子", date: "2026-10-02", gender: "女性", age: 72, insurance_rate: "1割", store_id: 1 },
  { id: 5, patient_name: "架空 太郎", date: "2026-10-17", insurance_rate: "2割", store_id: 1 },
];

test("総合・技術・商品、保険の割合ごとの内訳、商品の種類", () => {
  const r = SR.buildReport(payments, { from: "2026-10-01", to: "2026-10-31", bookings });
  assert.deepEqual(plain(r.total), { count: 4, amount: 800 + 9600 + 0 + 1100 - 1100 });
  assert.deepEqual(plain(r.goods), { count: 1, amount: 5500 });
  assert.deepEqual(plain(r.goodsRows.corset), { count: 1, amount: 5500 });
  assert.deepEqual(plain(r.techRows.r1), { count: 1, amount: 800 });
  assert.deepEqual(plain(r.techRows.r3), { count: 1, amount: 1100 });
  assert.deepEqual(plain(r.techRows.r2), { count: 1, amount: 0 }); // 保険2割の1,100円は返金済み
  assert.equal(r.techRows.other.amount, 3000); // 自費の鍼
  assert.equal(r.days, 4);
});

test("来店区分：新規・再来（¥0も来院）・固定・ごぶさた", () => {
  const r = SR.buildReport(payments, { from: "2026-10-01", to: "2026-10-31", bookings });
  assert.deepEqual(plain(Object.fromEntries(Object.entries(r.visitClass).map(([k, v]) => [k, v.count]))), { new: 1, return: 1, regular: 1, lapsed: 1, guest: 0 });
});

test("性別・年代・新規のきっかけ（問診票の記入から）", () => {
  const r = SR.buildReport(payments, { from: "2026-10-01", to: "2026-10-31", bookings });
  assert.equal(r.gender.male.count, 3);
  assert.equal(r.gender.female.count, 1);
  assert.equal(r.ages["40"].male, 3);
  assert.equal(r.ages["70"].female, 1);
  assert.equal(r.sources.flyer.male, 1);
});

test("支払方法・消費税（保険は非課税）・返金", () => {
  const r = SR.buildReport(payments, { from: "2026-10-01", to: "2026-10-31", bookings });
  assert.deepEqual(plain(r.pay.cash), { count: 2, amount: 1900 });
  assert.deepEqual(plain(r.pay.credit), { count: 1, amount: 8500 });
  assert.deepEqual(plain(r.pay.emoney), { count: 1, amount: 1100 });
  assert.equal(r.taxable, 8500); // 自費の鍼＋物販（保険の返金は非課税側から引く）
  assert.equal(r.nonTaxable, 800 + 1100 + 1100 - 1100);
  assert.equal(r.taxIncluded, Math.round(8500 * 10 / 110));
  assert.deepEqual(plain(r.refund), { count: 1, amount: 1100 });
});

test("支払方法の読み取り", () => {
  assert.deepEqual(plain(SR.parsePayments("現金:¥2,000・カード:¥3,600", 5600)), [{ kind: "cash", amount: 2000 }, { kind: "credit", amount: 3600 }]);
  assert.deepEqual(plain(SR.parsePayments("現金:2000", 2000)), [{ kind: "cash", amount: 2000 }]);
  assert.deepEqual(plain(SR.parsePayments("現金", 800)), [{ kind: "cash", amount: 800 }]);
});

test("保険の窓口負担を柔整・鍼灸に分ける（分けて保存した会計・古い会計）", () => {
  assert.deepEqual(plain(SR.insuranceSplit({ insurance_amount: 1400, insurance_type: "手技療法＋鍼灸併用", ju_insurance_amount: 800, acu_insurance_amount: 600 })), { ju: 800, acu: 600 });
  assert.deepEqual(plain(SR.insuranceSplit({ insurance_amount: 600, insurance_type: "鍼灸併用" })), { ju: 0, acu: 600 });
  assert.deepEqual(plain(SR.insuranceSplit({ insurance_amount: 800, insurance_type: "手技療法" })), { ju: 800, acu: 0 });
  const r = SR.buildReport([
    { id: 1, booking_id: 1, patient_name: "架空 一", payment_date: "2026-11-01", staff_id: 1, insurance_amount: 1400, jifee_amount: 0, total_amount: 1400, insurance_type: "手技療法＋鍼灸併用", ju_insurance_amount: 800, acu_insurance_amount: 600 },
    { id: 2, booking_id: 2, patient_name: "架空 二", payment_date: "2026-11-01", staff_id: 1, insurance_amount: 1100, jifee_amount: 0, total_amount: 1100, insurance_type: "手技療法" },
  ], { from: "2026-11-01", to: "2026-11-30", bookings: [] });
  assert.deepEqual(plain(r.juIns), { count: 2, amount: 1900 });
  assert.deepEqual(plain(r.acuIns), { count: 1, amount: 600 });
});
