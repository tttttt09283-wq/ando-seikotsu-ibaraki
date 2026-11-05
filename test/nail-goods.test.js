import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// 画面用のスクリプト（window.NailGoods に載せる形）をそのまま読み込む
const ctx = {};
vm.runInNewContext(readFileSync(new URL("../nail-goods-logic.js", import.meta.url), "utf8"), ctx);
const NG = ctx.NailGoods;

test("分析表と同じ計算式で指標が出る（2026年1月）", () => {
  const m = NG.nailMonthMetrics(NG.SEED_NAIL_2026["2026-01"]);
  assert.equal(Math.round(m.secondRate), 50);
  assert.equal(Math.round(m.fourRate), 50);
  assert.equal(Math.round(m.unitPrice), 16019);
  assert.equal(Math.round(m.dropRate), 20);
  assert.equal(m.dailyAve, 1);
});

test("門真の1〜10月の合計・平均が分析表（PDF）と一致する", () => {
  const s = NG.nailSummary(NG.SEED_NAIL_2026);
  assert.equal(s.count, 10);
  assert.equal(s.sum.newCount, 75);
  assert.equal(s.sum.total, 364);
  assert.equal(s.sum.second, 51);
  assert.equal(s.sum.four, 24);
  assert.equal(s.sum.inquiry, 88);
  assert.equal(s.sum.drop, 14);
  assert.equal(Math.round(s.sum.sales / 1000), 4686); // 468.6万
  assert.equal(Math.round(s.metrics.secondRate), 68);
  assert.equal(Math.round(s.metrics.fourRate), 32);
  assert.equal(Math.round(s.metrics.unitPrice), 12874);
  assert.equal(Math.round(s.metrics.dropRate), 16);
  assert.equal(s.lastKey, "2026-10");
});

test("5センターの2026年の売上合計・平均単価が各分析表と一致する", () => {
  const sum = (id, y) => NG.nailSummary(NG.SEED_CENTERS.find((c) => c.id === id).nail, y);
  const ids = ["kadoma", "ibaraki", "tsuda", "katano", "hirakata"];
  assert.deepEqual(ids.map((id) => Math.round(sum(id, "2026").sum.sales / 1000)), [4686, 7144, 3424, 3401, 5532]);
  assert.deepEqual(ids.map((id) => Math.round(sum(id, "2026").metrics.unitPrice)), [12874, 12511, 10407, 14598, 13234]);
  // 枚方は2025年分もある（12か月・新規87人・売上577.2万）
  const h25 = sum("hirakata", "2025");
  assert.equal(h25.count, 12);
  assert.equal(h25.sum.newCount, 87);
  assert.equal(Math.round(h25.sum.sales / 1000), 5772);
});

test("センターを足し合わせる（平均通院回数は平均）", () => {
  const centers = [
    { nail: { "2026-01": { newCount: 2, total: 10, sales: 100000, avgVisits: 4 } } },
    { nail: { "2026-01": { newCount: 3, total: 20, sales: 200000, avgVisits: 2 }, "2026-02": { total: 0 } } },
  ];
  const m = NG.combineCenters(centers);
  assert.deepEqual(Object.keys(m), ["2026-01"]);
  assert.equal(m["2026-01"].newCount, 5);
  assert.equal(m["2026-01"].total, 30);
  assert.equal(m["2026-01"].avgVisits, 3);
  const all = NG.nailSummary(NG.combineCenters(NG.SEED_CENTERS), "2026");
  assert.equal(all.sum.newCount, 309);
  assert.equal(all.last.cont, 154);
});

test("昨対比・費用対効果は数字が入っている月だけで計算する", () => {
  const s = NG.nailSummary({
    "2026-01": { newCount: 2, total: 10, sales: 100000 },
    "2026-02": { newCount: 4, total: 10, sales: 300000, lastYearSales: 150000, cost: 60000 },
  });
  assert.equal(s.metrics.yoy, 200);
  assert.equal(s.metrics.salesPerCost, 5);
  assert.equal(s.metrics.costPerNew, 15000);
});

test("以前の保存データ（門真だけ）をセンター別に直す", () => {
  const list = NG.migrateCenters({ center: "門真巻き爪センター", nail: { "2026-11": { total: 40, newCount: 5 }, "2026-01": { total: 1 } } });
  assert.equal(list.length, 5);
  const kad = list.find((c) => c.id === "kadoma");
  assert.equal(kad.nail["2026-11"].total, 40); // 手で入れた月は残す
  assert.equal(kad.nail["2026-01"].total, 24); // 分析表の月は分析表の数字
  const kept = NG.migrateCenters({ centers: [{ id: "kadoma", name: "門真", nail: {} }] });
  assert.equal(kept.length, 5);
  assert.deepEqual(kept[0].nail, {});
});

test("指標の判定（高いほど良い／低いほど良い）", () => {
  assert.equal(NG.judgeKpi("secondRate", 92), "ideal");
  assert.equal(NG.judgeKpi("secondRate", 70), "ok");
  assert.equal(NG.judgeKpi("secondRate", 57), "ng");
  assert.equal(NG.judgeKpi("dropRate", 15), "ideal");
  assert.equal(NG.judgeKpi("dropRate", 36), "ng");
  assert.equal(NG.judgeKpi("unitPrice", null), null);
});

test("分析表の実績から見込みの対象人数を作る", () => {
  const segs = NG.segmentsFromNail(NG.nailSummary(NG.SEED_NAIL_2026));
  assert.equal(segs.find((g) => g.id === "nail_new").perMonth, 7.5);
  assert.equal(segs.find((g) => g.id === "nail_cont").once, 36);
  assert.equal(segs.find((g) => g.id === "nail_second").perMonth, 5.1);
});

test("見込み：立ち上げ月は継続中の方の分だけ多く、買い替えも数える", () => {
  const products = [{ id: "insole", name: "インソール", price: 5000, cost: 2000, cycle: 2, repeat: 50, lot: 10 }];
  const segments = [{ id: "a", perMonth: 10, once: 10, propose: 100, conv: { insole: 50 } }];
  const f = NG.forecast({ products, segments, months: 4 });
  assert.equal(f.rows[0].units.insole, 10); // (10+10)×100%×50%
  assert.equal(f.rows[1].units.insole, 5);
  assert.equal(f.rows[2].units.insole, 5 + 10 * 0.5); // 1か月目の購入者の半分が買い替え
  assert.equal(f.rows[3].units.insole, 5 + 5 * 0.5);
  assert.equal(f.rows[0].sales, 50000);
  assert.equal(f.rows[0].gross, 30000);
  assert.equal(f.initialCost, 20000);
  assert.equal(f.paybackMonth, 1);
  assert.equal(f.stockOut.insole, 1);
});

test("シナリオで購入率が増減する", () => {
  const base = NG.forecast({ months: 12 });
  const low = NG.forecast({ months: 12, factor: 0.6 });
  assert.ok(low.total.sales < base.total.sales);
  assert.ok(Math.abs(low.total.sales / base.total.sales - 0.6) < 0.01);
});

test("目標売上から必要な人数を逆算する", () => {
  const products = [{ id: "insole", price: 5000 }];
  const segments = [{ perMonth: 10, propose: 50, conv: { insole: 20 } }];
  const r = NG.requiredForTarget({ targetSales: 20000, products, segments });
  assert.equal(r.currentSales, 5000);
  assert.equal(r.people, 40);
  assert.equal(r.proposals, 20);
  assert.equal(r.units, 4);
  assert.equal(NG.requiredForTarget({ targetSales: 0, products, segments }), null);
});

test("POSの会計から巻き爪と物販を集計する（返金は除く）", () => {
  const pays = [
    { booking_id: 1, jifee_items: [{ label: "巻き爪（新規）", amount: 20350 }, { label: "物販：インソール", amount: 5500 }] },
    { booking_id: 2, jifee_items: [{ label: "巻き爪（継続）", amount: 17600 }, { label: "物販：室内サンダル", amount: 8800, qty: 2 }] },
    { booking_id: 3, is_refund: true, jifee_items: [{ label: "物販：インソール", amount: -5500 }] },
  ];
  const a = NG.aggregatePayments(pays);
  assert.equal(a.makiNew, 1);
  assert.equal(a.makiCont, 1);
  assert.equal(a.makiSales, 37950);
  assert.equal(a.goods.insole.units, 1);
  assert.equal(a.goods.sandal.units, 2);
  assert.equal(a.goodsSales, 14300);
  assert.equal(a.buyers, 2);
});

test("提案記録の成約率と見送り理由", () => {
  const logs = [
    { date: "2026-11-02", segment: "巻き爪 新規", product: "insole", result: "購入" },
    { date: "2026-11-03", segment: "巻き爪 新規", product: "insole", result: "見送り", reason: "価格" },
    { date: "2026-11-05", segment: "巻き爪 継続中", product: "sandal", result: "検討中" },
    { date: "2026-10-30", segment: "巻き爪 新規", product: "insole", result: "購入" },
  ];
  const a = NG.aggregateProposals(logs, "2026-11");
  assert.equal(a.all.proposals, 3);
  assert.equal(a.all.bought, 1);
  assert.equal(Math.round(a.all.rate), 33);
  assert.equal(a.byProduct.insole.rate, 50);
  assert.equal(a.reasons["価格"], 1);
});

test("在庫の残り", () => {
  const p = { id: "insole" };
  assert.equal(NG.stockLeft(p, [{ product: "insole", qty: 20 }, { product: "sandal", qty: 5 }, { product: "insole", qty: 10 }], 12), 18);
});

test("練習（トレーニングモード）の会計は本番の集計に入れない", () => {
  const pays = [
    { booking_id: 1, jifee_items: [{ label: "物販：インソール", amount: 5500 }] },
    { booking_id: 2, is_training: true, jifee_items: [{ label: "物販：インソール", amount: 5500 }] },
  ];
  assert.equal(NG.aggregatePayments(pays).goodsUnits, 1);
  assert.equal(NG.aggregatePayments(pays, undefined, true).goodsUnits, 1);
  assert.equal(NG.aggregatePayments(pays, undefined, true).goods.insole.units, 1);
});
