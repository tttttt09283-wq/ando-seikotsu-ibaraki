// EHMS 共通計算エンジンのテスト（要件定義書 36. テスト要件。架空のデータ）
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = {};
vm.runInNewContext(readFileSync(new URL("../hq/ehms-calc.js", import.meta.url), "utf8"), ctx);
const E = ctx.EHMS;
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≒ ${b}`);

test("テスト1 PL：売上300万・原価15万・販管費205万 → 粗利285万・営業利益80万・営業利益率26.67%", () => {
  const p = E.pl({ revenue: 3_000_000, cogs: 150_000, sga: 2_050_000 });
  assert.equal(p.gross, 2_850_000);
  assert.equal(p.operating, 800_000);
  near(p.operatingMargin, 800_000 / 3_000_000);
  assert.equal(p.complete, true);
  assert.match(p.explain.operating.formula, /営業利益 ＝ 売上総利益 − 販売費及び一般管理費/);
});

test("テスト2 必要売上：総固定的負担額56万・変動費率5%・目標営業利益率20% → 746,666.67円", () => {
  const r = E.requiredSales({ totalBurden: 560_000, variableRate: 0.05, targetMargin: 0.20 });
  near(r.required, 746_666.6666666666);
  assert.equal(Math.round(r.required * 100) / 100, 746_666.67);
  near(r.breakEven, 560_000 / 0.95);
  assert.ok(E.requiredSales({ totalBurden: 1, variableRate: 0.5, targetMargin: 0.5 }).error); // 分母がゼロ以下は計算しない
});

test("テスト3 昇給：35人・月1万円・社保16% → 追加給与420万・社保67.2万・人件費487.2万・必要売上649.6万", () => {
  const r = E.raiseImpact({ headcount: 35, monthlyRaise: 10_000, socialRate: 0.16, variableRate: 0.05, marginRate: 0.20 });
  assert.equal(r.addPay, 4_200_000);
  near(r.addSocial, 672_000);
  near(r.addLabor, 4_872_000);
  near(r.requiredSales, 6_496_000);
});

test("テスト4 新規出店：固定費240万・変動費率8%・売上350万 → 損益分岐点約260.87万・営業利益82万", () => {
  const r = E.breakEven({ fixed: 2_400_000, variableRate: 0.08, sales: 3_500_000 });
  near(r.breakEven, 2_608_695.652173913);
  near(r.operatingProfit, 820_000);
});

test("テスト5 人員配置：需要1,000件・20日・1日15件・稼働率80% → 1人240件・常勤換算4.17人・実人数5人", () => {
  const r = E.staffing({ demand: 1000, workDays: 20, maxPerDay: 15, utilization: 0.8 });
  near(r.perStaff, 240);
  near(r.fte, 1000 / 240);
  assert.equal(r.heads, 5);
});

test("売上ゼロ・未入力：比率は算出不可（null）で、0%にしない。未入力とゼロを区別する", () => {
  const zero = E.pl({ revenue: 0, cogs: 0, sga: 100_000, labor: 50_000 });
  assert.equal(zero.operatingMargin, null);
  assert.equal(zero.laborRatio, null);
  assert.equal(zero.operating, -100_000); // 赤字
  const empty = E.pl({});
  assert.equal(empty.revenue, null);
  assert.equal(empty.operating, null);
  assert.equal(empty.complete, false);
  assert.equal(E.sumOrNull([null, undefined, ""]), null);
  assert.equal(E.sumOrNull([0, null]), 0);
});

test("年間集計：比率は月の比率の平均ではなく、年間の分子÷分母で出し直す（加重）", () => {
  const m1 = E.pl({ revenue: 1_000_000, cogs: 0, sga: 900_000 }); // 利益率10%
  const m2 = E.pl({ revenue: 3_000_000, cogs: 0, sga: 1_500_000 }); // 利益率50%
  const y = E.aggregate([m1, m2, null]);
  near(y.operatingMargin, 1_600_000 / 4_000_000); // 40%（平均の30%ではない）
  assert.equal(y.months, 2);
  const p = E.periodSums([m1, m2, ...Array(10).fill(null)]);
  assert.equal(p.h1.revenue, 4_000_000);
  assert.equal(p.h2.revenue, null); // 未入力の期間は null
});

test("科目マスターからPL：人件費・固定費・変動費を区分し、本部経費の配賦は販管費・固定費に入る", () => {
  const accounts = [
    { id: "r", section: "revenue" }, { id: "c", section: "cogs" },
    { id: "pay", section: "sga", is_labor: true, is_fixed: true }, { id: "fee", section: "sga", is_fixed: false }, { id: "rent", section: "sga", is_fixed: true },
  ];
  const recs = [{ account_id: "r", amount: 2_000_000 }, { account_id: "c", amount: 100_000 }, { account_id: "pay", amount: 800_000 }, { account_id: "fee", amount: 40_000 }, { account_id: "rent", amount: 200_000 }];
  const before = E.plFromRecords(recs, accounts);
  assert.equal(before.operating, 860_000);
  assert.equal(before.labor, 800_000);
  assert.equal(before.fixed, 1_000_000);
  assert.equal(before.variable, 140_000);
  near(before.breakEven, 1_000_000 / (1 - 140_000 / 2_000_000));
  const after = E.plFromRecords(recs, accounts, { allocatedHq: 160_000 });
  assert.equal(after.operating, 700_000);
});

test("本部経費の配賦：どの方式でも配賦額の合計は本部経費と一致（全社で二重計上しない）", () => {
  const stores = [{ id: "a", sales: 1_000_000, headcount: 3, fte: 2.5 }, { id: "b", sales: 2_000_000, headcount: 5, fte: 4 }, { id: "c", sales: 0, headcount: 2, fte: 2 }];
  for (const method of ["sales", "headcount", "fte", "equal"]) {
    const r = E.allocate(1_000_001, stores, method);
    assert.equal(Object.values(r.shares).reduce((a, b) => a + b, 0), 1_000_001, method);
  }
  const s = E.allocate(300_000, stores, "sales");
  assert.deepEqual({ ...s.shares }, { a: 100_000, b: 200_000, c: 0 });
  assert.equal(E.allocate(100, [{ id: "x", manual: 0 }], "manual").unallocated, 100); // 配賦先がなければ配らずに残す
});

test("年間着地予測：確定実績＋未経過月の予測。直近3か月平均・予算・前年季節・必要平均売上", () => {
  const actual = [100, 200, 300, null, null, null, null, null, null, null, null, null];
  const budget = Array(12).fill(250);
  const prior = Array(12).fill(200);
  const a3 = E.landing({ actual, budget, prior, method: "avg3", target: 3000 });
  assert.equal(a3.actualSum, 600);
  assert.equal(a3.forecastSum, 200 * 9);
  assert.equal(a3.value, 2400);
  assert.equal(a3.remaining, 9);
  near(a3.requiredAvg, (3000 - 600) / 9);
  near(a3.achievement, 0.8);
  assert.equal(E.landing({ actual, budget, method: "budget" }).value, 600 + 250 * 9);
  near(E.landing({ actual, prior, method: "seasonal" }).value, 600 + 200 * (600 / 600) * 9);
  assert.ok(a3.scenarios.optimistic > a3.scenarios.standard && a3.scenarios.standard > a3.scenarios.pessimistic);
});

test("年度：会計年度の開始月を変えられる（7月始まり・4月始まり）", () => {
  assert.deepEqual([...E.fiscalMonths(2026, 7)].slice(0, 2), ["2026-07", "2026-08"]);
  assert.equal(E.fiscalMonths(2026, 7)[11], "2027-06");
  assert.equal(E.fiscalMonths(2026, 4)[11], "2027-03");
  assert.equal(E.fiscalYearOf("2027-03", 7), 2026);
  assert.equal(E.fiscalYearOf("2027-03", 4), 2026);
  assert.equal(E.fiscalYearOf("2027-04", 4), 2027);
  assert.equal(E.shiftMonth("2026-12", 1), "2027-01");
});

test("アラート：予算未達・営業赤字・人件費率超過・年間目標未達見込みに、理由・根拠・確認・推奨アクションを付ける", () => {
  const monthPl = E.pl({ revenue: 1_000_000, cogs: 0, sga: 1_200_000 });
  const yearPl = E.pl({ revenue: 10_000_000, cogs: 0, sga: 9_000_000, labor: 5_000_000 });
  const a = E.alerts({ yearPl, monthPl, monthVariance: E.variance(2_000_000, 1_000_000), targets: { labor_ratio: 0.45, operating_margin: 0.2 }, landingResult: { achievement: 0.9, value: 900, remaining: 3, requiredAvg: 100 }, target: 1000 });
  const titles = a.map((x) => x.title);
  for (const t of ["売上予算未達", "営業赤字", "人件費率超過", "目標営業利益率に未達", "年間目標未達見込み"]) assert.ok(titles.includes(t), t);
  for (const x of a) { assert.ok(x.reason && x.check && x.action); }
});

test("Phase 2 日計表→科目：保険窓口＋自費＋物販＋請求＝総売上（巻き爪・自賠は取り込まない）。柔整・鍼灸の請求が分かれていれば分ける", () => {
  const r = E.dailyTotalToRecords({ 総売上: 1_802_270, 保険窓口: 547_550, 自費合計: 648_700, 物販: 2_220, 請求額: 603_800, "巻き爪（売上）": 71_500, 自賠売上: 44_000, 新患数: 7, 総来院数: 667, キャンセル数: 62 });
  assert.equal(r.matches, true);
  assert.deepEqual([...r.records.map((x) => x.code)].sort(), ["R15", "R17", "R18", "R19"]);
  assert.deepEqual([...r.metrics.map((m) => m.metric)], ["new_patients", "visits", "cancels"]);
  const k = E.dailyTotalToRecords({ 総売上: 851_880, 保険窓口: 100_000, 自費合計: 487_880, 物販: 0, 柔整請求額: 264_000, 鍼灸請求額: 0, 請求額合計: 264_000 });
  assert.equal(k.matches, true);
  assert.ok(k.records.some((x) => x.code === "R02") && !k.records.some((x) => x.code === "R19"));
});

test("Phase 2 雇用コスト・生産性：社保は未入力なら率で見込む。分母が未入力の指標は算出不可", () => {
  const c = E.employmentCost({ total_pay: 300_000, bonus_budget: 20_000 }, { socialRate: 0.155 });
  near(c.total, 300_000 + 46_500 + 20_000);
  assert.equal(c.socialEstimated, true);
  assert.equal(E.employmentCost({}, {}), null);
  const p = E.productivity({ sales: 900_000, cost: c.total, workDays: 20, workHours: null, fte: 1, required: 1_000_000 });
  near(p.perDay, 45_000);
  assert.equal(p.perHour, null);
  near(p.requiredRate, 0.9);
});

test("Phase 2 必要売上の説明文・内訳・実現可能性", () => {
  const p = { salary: 300_000, socialInsurance: 46_500, bonus: 25_000, welfare: 5_000, education: 3_500, storeFixed: 150_000, hqAllocation: 30_000, variableRate: 0.05, targetMargin: 0.2 };
  const r = E.requiredSales(p);
  assert.equal(r.employment, 380_000);
  assert.equal(r.burden, 560_000);
  near(r.required, 746_666.6666666666);
  const text = E.requiredSalesText(r, p);
  assert.match(text, /月給30万円/);
  assert.match(text, /74\.7万円/);
  const parts = E.requiredSalesBreakdown(r, p, { base: 300_000 });
  near(parts.reduce((a, x) => a + x.value, 0), r.required); // 内訳の合計＝必要売上
  const f = E.feasibility({ required: r.required, treatHours: 100, unitPrice: 3000, maxPerHour: 2, utilization: 0.8 });
  assert.equal(f.level, "ng"); // 7,467円/時 ＞ 上限 4,800円/時
  assert.equal(E.feasibility({ required: 400_000, treatHours: 100, unitPrice: 3000, maxPerHour: 2, utilization: 0.8 }).level, "ok");
});

test("Phase 2 適正人員（需要から）：不足・余剰・人件費の増減・機会損失、曜日ごとの必要人数", () => {
  const r = E.staffingByDemand({ demand: 1000, workDays: 20, maxPerDay: 15, utilization: 0.8, currentFte: 3, avgCost: 350_000, unitPrice: 3000 });
  near(r.fte, 1000 / 240);
  near(r.shortage, 1000 / 240 - 3);
  near(r.laborDelta, (1000 / 240 - 3) * 350_000);
  near(r.unmet, 1000 - 720);
  near(r.opportunityLoss, 280 * 3000);
  const w = E.weekdayNeeds([{ date: "2026-11-02", visits: 40 }, { date: "2026-11-09", visits: 50 }, { date: "2026-11-03", visits: 0 }], 12);
  assert.equal(w[1].avg, 45); // 月曜
  near(w[1].need, 45 / 12);
  assert.equal(w[2].avg, null); // 0 は記録なしとして扱う
});
