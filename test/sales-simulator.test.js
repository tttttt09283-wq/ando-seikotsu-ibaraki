// node --test test/*.test.js で実行（架空のデータ）
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = {};
vm.runInNewContext(readFileSync(new URL("../sales-simulator-logic.js", import.meta.url), "utf8"), ctx);
const S = ctx.SalesSim;
const plain = (v) => JSON.parse(JSON.stringify(v));
const make = (mutate = () => {}) => { const i = S.cloneInput(S.DEFAULT_INPUT); mutate(i); return i; };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≒ ${b}`);

// ===== 初期値での計算 =====
test("初期値：延べ来院数・柔整・鍼灸・自費・総売上", () => {
  const r = S.calculate(S.DEFAULT_INPUT);
  assert.equal(r.totalVisits, 500);
  assert.deepEqual([r.judo.count, r.judo.copaySales, r.judo.claimSales, r.judo.total], [500, 250000, 850000, 1100000]);
  assert.deepEqual([r.acu.count, r.acu.oneCount, r.acu.twoCount, r.acu.twoRate], [300, 90, 210, 70]);
  assert.equal(r.acu.copaySales, 90 * 300 + 210 * 400);
  assert.equal(r.acu.claimSales, 90 * 1200 + 210 * 1600);
  assert.equal(r.acu.total, 555000);
  assert.deepEqual([r.self.treatmentSales, r.self.emsCount, r.self.emsSales, r.self.total], [200000, 100, 200000, 400000]);
  assert.equal(r.totalSales, 2055000);
  close(r.achievementRate, 51.375);
  assert.equal(r.shortfall, 1945000);
  assert.equal(r.surplus, 0);
  assert.deepEqual([r.salesPerKarte, r.salesPerVisit, r.salesPerStaff, r.visitsPerDay], [20550, 4110, 513750, 20]);
});

// ===== 重複計上しない =====
test("柔整100%＋鍼灸60%でも延べ来院数は増えない（対応数の合計は来院数を超えてよい）", () => {
  const r = S.calculate(S.DEFAULT_INPUT);
  assert.equal(r.judo.count + r.acu.count, 800);
  assert.equal(r.totalVisits, 500);
  assert.equal(r.salesPerVisit, r.totalSales / 500);
});

test("総売上＝各項目の単純合計（どれも二重に入らない）・固定＋連動＝総売上", () => {
  const r = S.calculate(make((i) => { i.self.productSales = 123456; i.self.otherSales = 7890; }));
  assert.equal(r.totalSales, r.judo.total + r.acu.total + r.self.treatmentSales + r.self.emsSales + 123456 + 7890);
  assert.equal(r.insuranceTotal + r.self.total, r.totalSales);
  assert.equal(r.fixedSales, 123456 + 7890);
  assert.equal(r.fixedSales + r.variableSales, r.totalSales);
  assert.equal(r.judo.copaySales + r.judo.claimSales, r.judo.total);
  assert.equal(r.acu.copaySales + r.acu.claimSales, r.acu.total);
});

test("1術＋2術は常に鍼灸延べ対応数と一致する（端数があっても）", () => {
  for (let visits = 1; visits <= 60; visits++)
    for (const acuRate of [0, 13, 33.3, 50, 66.7, 99.9, 100])
      for (const oneRate of [0, 12.5, 33.3, 50, 77.7, 100]) {
        const r = S.calculate(make((i) => { i.basic.karteCount = visits; i.basic.visitsPerKarte = 1; i.acu.rate = acuRate; i.acu.oneRate = oneRate; }));
        assert.equal(r.acu.oneCount + r.acu.twoCount, r.acu.count);
        assert.ok(r.acu.oneCount >= 0 && r.acu.twoCount >= 0);
        assert.ok(r.acu.count <= r.totalVisits);
      }
});

// ===== 端数処理 =====
test("roundCount：四捨五入・浮動小数点誤差に影響されない・マイナスとNaNは0", () => {
  assert.equal(S.roundCount(2.4), 2);
  assert.equal(S.roundCount(2.5), 3);
  assert.equal(S.roundCount(0.1 * 3 * 10), 3); // 2.9999999999999996
  assert.equal(S.roundCount(1.005 * 1000), 1005); // 1004.9999999999999
  assert.equal(S.roundCount(-3), 0);
  assert.equal(S.roundCount(NaN), 0);
});

test("延べ来院数・対応数は四捨五入、鍼灸2術は残り", () => {
  assert.equal(S.calculate(make((i) => { i.basic.karteCount = 33; i.basic.visitsPerKarte = 4.5; })).totalVisits, 149); // 148.5
  assert.equal(S.calculate(make((i) => { i.basic.karteCount = 7; i.basic.visitsPerKarte = 3.3; })).totalVisits, 23); // 23.1
  assert.equal(S.countByRate(149, 60), 89); // 89.4
  assert.equal(S.countByRate(25, 50), 13); // 12.5
  assert.equal(S.countByRate(500, 33.3), 167); // 166.5
  const r = S.calculate(make((i) => { i.basic.karteCount = 5; i.basic.visitsPerKarte = 1; i.acu.rate = 100; i.acu.oneRate = 50; }));
  assert.deepEqual([r.acu.count, r.acu.oneCount, r.acu.twoCount], [5, 3, 2]);
});

test("金額は常に整数円", () => {
  const r = S.calculate(make((i) => { i.basic.karteCount = 37; i.basic.visitsPerKarte = 3.7; i.acu.rate = 41.3; i.acu.oneRate = 27.9; i.self.emsRate = 13.3; }));
  [r.totalSales, r.judo.total, r.acu.total, r.self.total, r.self.emsSales].forEach((v) => assert.ok(Number.isInteger(v)));
});

// ===== 柔整の直接入力 =====
test("柔整：直接入力した件数で計算し、来院数を超える分は来院数に抑えて警告", () => {
  const r = S.calculate(make((i) => { i.judo.useManualCount = true; i.judo.manualCount = 420; }));
  assert.equal(r.judo.count, 420);
  close(r.judo.effectiveRate, 84);
  const over = S.calculate(make((i) => { i.judo.useManualCount = true; i.judo.manualCount = 900; }));
  assert.equal(over.judo.count, 500);
  assert.ok(over.warnings.length > 0);
});

// ===== ゼロ除算 =====
test("すべて0でも NaN・Infinity が出ない", () => {
  const r = S.calculate(make((i) => { i.basic = { karteCount: 0, visitsPerKarte: 0, workingDays: 0, staffCount: 0, targetSales: 0 }; }));
  assert.equal(r.totalVisits, 0);
  assert.equal(r.achievementRate, null);
  assert.equal(r.salesPerKarte, null);
  assert.equal(r.salesPerVisit, null);
  assert.equal(r.salesPerStaff, null);
  assert.equal(r.visitsPerDay, null);
  assert.equal(r.judo.effectiveRate, 0);
  assert.equal(r.shortfall, 0);
  assert.equal(S.safeDivide(10, 0), null);
});

test("目標を達成したら不足0・超過額を返す", () => {
  const r = S.calculate(make((i) => { i.basic.targetSales = 2000000; }));
  assert.equal(r.shortfall, 0);
  assert.equal(r.surplus, 55000);
});

// ===== 入力の安全化 =====
test("空欄・文字・マイナスは0、カンマ・全角・単位つきも読める、率は0〜100%", () => {
  assert.equal(S.toSafeNumber(""), 0);
  assert.equal(S.toSafeNumber("abc"), 0);
  assert.equal(S.toSafeNumber("4,000,000"), 4000000);
  assert.equal(S.toSafeNumber("１２３"), 123);
  assert.equal(S.toSafeNumber("500円"), 500);
  assert.equal(S.nonNegativeInt(-50), 0);
  assert.equal(S.percent(150), 100);
  assert.equal(S.percent(-5), 0);
  assert.equal(S.percent(33.333), 33.3);
  const s = S.sanitizeInput({ basic: { karteCount: "120" }, acu: { rate: 999 } }, S.DEFAULT_INPUT);
  assert.deepEqual([s.basic.karteCount, s.basic.visitsPerKarte, s.acu.rate, s.self.emsPrice], [120, 5, 100, 2000]);
});

// ===== 目標逆算 =====
test("findMinInteger", () => {
  assert.equal(S.findMinInteger((n) => n * 3, 10, 0, 100), 4);
  assert.equal(S.findMinInteger((n) => n, 0, 0, 10), 0);
  assert.equal(S.findMinInteger((n) => n, 11, 0, 10), null);
});

test("projectInput：自費件数は来院数に比例、固定売上と元の入力は変えない、変更なしなら売上も同じ", () => {
  const base = S.cloneInput(S.DEFAULT_INPUT);
  const p = S.projectInput(base, { karteCount: 200 });
  assert.equal(p.self.treatmentCount, 200);
  assert.equal(p.self.productSales, 0);
  assert.deepEqual(plain(base), plain(S.DEFAULT_INPUT));
  const manual = make((i) => { i.judo.useManualCount = true; i.judo.manualCount = 437; });
  assert.equal(S.calculate(S.projectInput(manual, {})).totalSales, S.calculate(manual).totalSales);
});

test("必要カルテ数は目標を満たす最小の整数（1枚少ないと届かない）", () => {
  const r = S.reverseCalculate(S.DEFAULT_INPUT);
  const at = (n) => S.calculate(S.projectInput(S.DEFAULT_INPUT, { karteCount: n })).totalSales;
  assert.equal(r.requiredKarte, 195);
  assert.ok(at(195) >= 4000000 && at(194) < 4000000);
  assert.deepEqual([r.additionalKarte, r.requiredVisits, r.requiredVisitsPerDay, r.requiredSalesPerStaff, r.gap], [95, 975, 39, 1000000, 1945000]);
});

test("端数でずれやすい条件でも、探索結果は最小の整数", () => {
  const base = make((i) => { i.basic.visitsPerKarte = 4.3; i.acu.rate = 37; i.acu.oneRate = 45; i.self.emsRate = 17; i.self.productSales = 50000; i.basic.targetSales = 3333333; });
  const k = S.reverseCalculate(base).requiredKarte;
  const at = (n) => S.calculate(S.projectInput(base, { karteCount: n })).totalSales;
  assert.ok(at(k) >= 3333333 && at(k - 1) < 3333333);
});

test("4つの改善ケース", () => {
  const r = S.reverseCalculate(S.DEFAULT_INPUT);
  const c = Object.fromEntries(r.cases.map((x) => [x.key, x]));
  assert.equal(c.visits.required, 9.8);
  assert.equal(c.visits.delta, 4.8);
  assert.equal(c.acuRate.achievable, false); // 100%でも 2,425,000円
  assert.equal(c.acuRate.required, null);
  assert.equal(c.selfPrice.required, 21450); // 不足1,945,000÷100件＝19,450円の上乗せ
  assert.equal(c.selfPrice.resultingSales, 4000000);
});

test("固定売上だけで達成なら0枚、連動売上が0なら達成不可、ゼロ入力でも例外なし", () => {
  assert.equal(S.reverseCalculate(make((i) => { i.self.productSales = 5000000; })).requiredKarte, 0);
  const none = S.reverseCalculate(make((i) => { i.judo.rate = 0; i.acu.rate = 0; i.self.treatmentCount = 0; i.self.emsRate = 0; }));
  assert.equal(none.requiredKarte, null);
  assert.equal(none.cases[0].achievable, false);
  const zero = S.reverseCalculate(make((i) => { i.basic = { karteCount: 0, visitsPerKarte: 0, workingDays: 0, staffCount: 0, targetSales: 0 }; }));
  assert.equal(zero.requiredKarte, 0);
  assert.equal(zero.requiredSalesPerStaff, null);
});

// ===== 月次の実績から読み込む =====
test("fromMonthlyActuals：カルテ枚数・来院回数・率だけを入れ、単価は変えない", () => {
  const row = { empty: false, karte: 120, visits: 610, juVisits: 580, acuVisits: 250, days: 24, therapists: 3 };
  const base = make((i) => { i.judo.useManualCount = true; });
  const next = S.fromMonthlyActuals(row, base);
  assert.deepEqual(plain(next.basic), { karteCount: 120, visitsPerKarte: 5.1, workingDays: 24, staffCount: 3, targetSales: 4000000 });
  assert.equal(next.judo.useManualCount, false);
  assert.equal(next.judo.rate, 95.1); // 580/610
  assert.equal(next.acu.rate, 41); // 250/610
  assert.deepEqual(plain(next.acu.one), plain(base.acu.one));
  assert.equal(next.judo.copay, base.judo.copay);
  assert.equal(S.fromMonthlyActuals({ empty: true }, base), null);
  assert.equal(S.fromMonthlyActuals({ empty: false, visits: 10, karte: 0 }, base), null);
});

// ===== 保存 =====
test("保存→復元で同じ状態、壊れたJSONは初期状態", () => {
  const st = S.createInitialState();
  st.active = "improve";
  st.scenarios.improve.input.basic.karteCount = 150;
  st.scenarios.improve.savedAt = "2026-01-01T00:00:00.000Z";
  assert.deepEqual(plain(S.parseStoredState(JSON.stringify(st))), plain(st));
  assert.deepEqual(plain(S.parseStoredState("{broken")), plain(S.createInitialState()));
  assert.deepEqual(plain(S.parseStoredState(null)), plain(S.createInitialState()));
});

test("保存キーは店舗ごと（共有設定の接頭語つき）", () => {
  assert.equal(S.storageKey(2), "sales_simulator_v1_2");
  assert.ok(S.storageKey(1).startsWith(S.STORAGE_PREFIX));
});

test("表示：3桁区切り・符号つき", () => {
  assert.equal(S.formatInt(4000000), "4,000,000");
  assert.equal(S.formatInt(null), "—");
  assert.equal(S.formatPercent(51.375), "51.4%");
  assert.equal(S.formatSigned(-1945000, "円"), "−1,945,000円");
  assert.equal(S.formatSigned(4.8, "回", true), "+4.8回");
});
