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
  assert.deepEqual(ids.map((id) => Math.round(sum(id, "2026").sum.sales / 1000)), [4686, 7144, 3830, 3821, 5532]);
  assert.deepEqual(ids.map((id) => Math.round(sum(id, "2026").metrics.unitPrice)), [12874, 12511, 10521, 16192, 13234]);
  // 枚方は2025年分もある（12か月・新規87人・売上577.2万）
  const h25 = sum("hirakata", "2025");
  assert.equal(h25.count, 12);
  assert.equal(h25.sum.newCount, 87);
  assert.equal(Math.round(h25.sum.sales / 1000), 5772);
});

test("枚方市駅前（原田）の分析表：新規・売上・各率が表の合計と一致する", () => {
  const nail = NG.SEED_CENTERS.find((c) => c.id === "hirakata_ekimae").nail;
  const s = NG.nailSummary(nail, "2026");
  assert.equal(s.count, 10);
  assert.equal(s.sum.newCount, 24);
  assert.equal(Math.round(s.sum.sales / 1000), 1105); // 110.4万（端数は単価×総人数）
  assert.equal(Math.round(s.metrics.secondRate), 71);
  assert.equal(Math.round(s.metrics.fourRate), 46);
  assert.equal(Math.round(s.metrics.dropRate), 29);
  assert.equal(nail["2026-09"].total, 9); // 表では0になっていた月は 新規＋再診＋継続＋治癒
  assert.equal(NG.nailSummary(nail, "2025").count, 4); // 2025年は8〜11月
});

test("津田の正式な分析表（10月は19日・554,400円）を、保存済みのデータにも1回だけ反映する", () => {
  const tsuda = NG.SEED_CENTERS.find((c) => c.id === "tsuda").nail;
  assert.equal(tsuda["2026-10"].sales, 554400);
  assert.equal(tsuda["2026-10"].days, 19);
  assert.equal(Math.round(NG.nailSummary(tsuda, "2026").sum.sales), 3829750);
  // 以前の数字（10月は5日分・148,500円）が保存されている場合
  const saved = [{ id: "tsuda", name: "津田巻き爪センター", nail: { "2026-10": { days: 5, total: 10, sales: 148500 }, "2026-11": { total: 30, sales: 400000 } } }];
  const applied = NG.applySeedPatches(saved, []);
  assert.deepEqual(applied, ["tsuda-2026-official", "tsuda-staff-2026-11", "hirakata-ekimae-sheet", "split-cost-2026-11", "katano-2026-11"]);
  assert.equal(saved[0].nail["2026-10"].sales, 554400);
  assert.equal(saved[0].nail["2026-11"].sales, 400000); // 手で入れた別の月は残す
  // 2回目は反映しない（その後に手で直した数字を上書きしない）
  saved[0].nail["2026-10"].sales = 560000;
  NG.applySeedPatches(saved, applied);
  assert.equal(saved[0].nail["2026-10"].sales, 560000);
});

test("津田の担当は10月まで児玉、11月から大森（保存済みのデータにも反映）", () => {
  const t = NG.SEED_CENTERS.find((c) => c.id === "tsuda");
  assert.equal(NG.staffAt(t, "2026-10"), "児玉");
  assert.equal(NG.staffAt(t, "2026-11"), "大森");
  assert.equal(NG.staffAt(t, "2027-03"), "大森");
  assert.equal(NG.staffLabel(t), "児玉→大森（26年11月〜）");
  // 交代の記録が無いセンターは、そのままの担当者
  assert.equal(NG.staffAt({ staff: "伊牟田" }, "2026-05"), "伊牟田");
  assert.equal(NG.staffLabel({ staff: "伊牟田" }), "伊牟田");
  // 保存済みのデータ（担当が大森だけ）にも交代の記録が入る
  const saved = [{ id: "tsuda", staff: "大森", nail: { "2026-10": { total: 45, sales: 554400 } } }];
  NG.applySeedPatches(saved, ["tsuda-2026-official", "katano-2026-11"]);
  assert.equal(NG.staffAt(saved[0], "2026-10"), "児玉");
  assert.equal(saved[0].nail["2026-10"].sales, 554400); // 数字はそのまま
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
  assert.equal(all.sum.newCount, 343);
  assert.equal(all.last.cont, 191);
});

test("昨対比・費用対効果は数字が入っている月だけで計算する", () => {
  const s = NG.nailSummary({
    "2026-01": { newCount: 2, total: 10, sales: 100000 },
    "2026-02": { newCount: 4, total: 10, sales: 300000, lastYearSales: 150000, adCost: 40000, stockCost: 20000 },
  });
  assert.equal(s.metrics.yoy, 200);
  assert.equal(s.metrics.salesPerCost, 5);    // 30万 ÷（広告4万＋仕入れ2万）
  assert.equal(s.metrics.adPerNew, 10000);    // 広告4万 ÷ 新規4人（広告費の無い1月は入れない）
  assert.equal(Math.round(s.metrics.stockRate * 10) / 10, 6.7); // 仕入れ2万 ÷ 売上30万
});

test("以前の保存データ（門真だけ）をセンター別に直す", () => {
  const list = NG.migrateCenters({ center: "門真巻き爪センター", nail: { "2026-11": { total: 40, newCount: 5 }, "2026-01": { total: 1 } } });
  assert.equal(list.length, 6);
  const kad = list.find((c) => c.id === "kadoma");
  assert.equal(kad.nail["2026-11"].total, 40); // 手で入れた月は残す
  assert.equal(kad.nail["2026-01"].total, 24); // 分析表の月は分析表の数字
  const kept = NG.migrateCenters({ centers: [{ id: "kadoma", name: "門真", nail: {} }] });
  assert.equal(kept.length, 6);
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

// ===== Googleスプレッドシートの巻き爪分析表を読む =====
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

test("スプレッドシートの分析表（交野）を読むと、取り込み済みの数字と同じになる", () => {
  const p = NG.parseNailSheets(fixture("nail-sheet-katano.json"));
  assert.equal(p.name, "交野巻き爪センター");
  assert.equal(p.staff, "藤原");
  assert.deepEqual([...p.skipped], ["2026-11"]); // 売上が未入力の11月は途中の月
  const seed = NG.SEED_CENTERS.find((c) => c.id === "katano").nail;
  assert.equal(JSON.stringify(Object.keys(p.months).sort()), JSON.stringify(Object.keys(seed).sort()));
  Object.keys(seed).forEach((ym) => assert.deepEqual({ ...p.months[ym] }, { ...seed[ym] }, ym));
});

test("表示形式のままの値（11.2万・100%・#DIV/0!）や崩れた総人数も読める（枚方市駅前）", () => {
  const p = NG.parseNailSheets(fixture("nail-sheet-hirakata-ekimae.json"));
  assert.equal(p.name, "枚方市駅前巻き爪センター");
  assert.equal(p.staff, "原田");
  assert.equal(Object.keys(p.months).length, 10);
  assert.ok(p.months["2026-01"], "表題は2025年でもシート名の（2026）を使う");
  assert.equal(p.months["2026-01"].sales, 112000);
  assert.deepEqual([...p.fixed], ["2026-09", "2026-10"]);
  assert.equal(p.months["2026-09"].total, 9);
  assert.equal(p.months["2026-10"].adCost, 50000); // 広告費と仕入れは別々の列
  assert.equal(p.months["2026-10"].stockCost, 70000);
  assert.equal(p.months["2026-10"].mixedCost, undefined);
});

test("前の年の月が翌年の同じ月と同じ数字なら、写し間違いとして外す", () => {
  const head = ["", "営業日数", "新規数", "総人数", "売上", "2回目継続", "問合せ件数"];
  const sheet = (title, jan) => ({ title, values: [["２０２６年", "", "〇〇巻き爪センター　施術者山田"], head, ["１月", 24, ...jan], ["２月", 24, 2, 4, 57200, 2, 4]] });
  const p = NG.parseNailSheets([sheet("分析表(2025)", [5, 10, 111650, 1, 8]), sheet("分析表（2026）", [5, 10, 111650, 5, 8])]);
  assert.deepEqual([...p.duplicate], ["2025-01", "2025-02"]);
  assert.ok(p.months["2026-01"] && !p.months["2025-01"]);
  assert.equal(p.staff, "山田");
});

test("読んだ月だけをセンターに反映し、変わった月を返す", () => {
  const c = { nail: { "2026-01": { total: 10, sales: 100 }, "2025-12": { total: 5, sales: 50 } } };
  const changed = NG.applySheetMonths(c, { "2026-01": { total: 10, sales: 100 }, "2026-02": { total: 3, sales: 30 } });
  assert.deepEqual([...changed], ["2026-02"]);
  assert.equal(c.nail["2025-12"].sales, 50); // スプレッドシートに無い月は残す
});

test("スプレッドシートのURLからIDを取り出す", () => {
  assert.equal(NG.sheetIdOf("https://docs.google.com/spreadsheets/d/1Uy3UytDSV4Gsv_EZXGmeorrpWRltJD7nqZBX4TgeYGA/edit?usp=sharing"), "1Uy3UytDSV4Gsv_EZXGmeorrpWRltJD7nqZBX4TgeYGA");
  assert.equal(NG.sheetIdOf("https://example.com/x"), "");
  assert.equal(NG.sheetIdOf(""), "");
});

test("枚方市駅前のスプレッドシートが、保存済みのデータにも自動読み込みの対象として入る", () => {
  const saved = [{ id: "hirakata_ekimae", nail: {} }];
  NG.applySeedPatches(saved, ["tsuda-2026-official", "tsuda-staff-2026-11", "katano-2026-11"]);
  assert.equal(NG.sheetIdOf(saved[0].sheetUrl), "1Uy3UytDSV4Gsv_EZXGmeorrpWRltJD7nqZBX4TgeYGA");
});

test("仕入れと広告費を分ける：分析表で分かれていた月は分け、合計しか無い月は内訳なし", () => {
  const kad = NG.SEED_CENTERS.find((c) => c.id === "kadoma").nail["2026-10"];
  assert.equal(kad.adCost, 50000);
  assert.equal(kad.stockCost, 41690);
  assert.equal(NG.SEED_CENTERS.find((c) => c.id === "tsuda").nail["2026-10"].mixedCost, 136680);
  // 以前の保存データ（cost に合計）を分ける
  const saved = [
    { id: "kadoma", nail: { "2026-10": { total: 43, sales: 510539, cost: 91690 }, "2026-11": { total: 40, sales: 500000, cost: 30000 } } },
    { id: "tsuda", nail: { "2026-10": { total: 45, sales: 554400, cost: 136680 } } },
  ];
  NG.applySeedPatches(saved, ["tsuda-2026-official", "tsuda-staff-2026-11", "hirakata-ekimae-sheet", "katano-2026-11"]);
  assert.deepEqual({ ...saved[0].nail["2026-10"] }, { total: 43, sales: 510539, adCost: 50000, stockCost: 41690 });
  assert.equal(saved[0].nail["2026-11"].mixedCost, 30000); // 手で入れた合計は内訳なしへ
  assert.equal(saved[0].nail["2026-11"].cost, undefined);
  assert.equal(saved[1].nail["2026-10"].mixedCost, 136680);
});

test("スプレッドシートの費用の列：別々なら広告費・仕入れ、合計だけなら内訳なし", () => {
  const sheet = (cols, vals) => [{ title: "分析表", values: [["２０２６年", "", "〇〇巻き爪センター　施術者山田"], ["", "営業日数", "新規数", "総人数", "売上", ...cols], ["１月", 20, 2, 10, 100000, ...vals]] }];
  const a = NG.parseNailSheets(sheet(["広告費", "仕入原価", "広告原価費＋仕入"], [50000, 41690, 91690])).months["2026-01"];
  assert.equal(a.adCost, 50000);
  assert.equal(a.stockCost, 41690);
  assert.equal(a.mixedCost, undefined); // 別々の列があれば合計の列は使わない
  const b = NG.parseNailSheets(sheet(["仕入れ+広告費"], [136680])).months["2026-01"];
  assert.equal(b.mixedCost, 136680);
  assert.equal(b.adCost, undefined);
});

test("全センター合計の広告費/新規・仕入れ率は、その費用を入れたセンターの数字だけで割る", () => {
  const all = NG.nailSummary(NG.combineCenters([
    { nail: { "2026-01": { newCount: 5, total: 20, sales: 200000, adCost: 50000, stockCost: 20000 } } },
    { nail: { "2026-01": { newCount: 20, total: 80, sales: 800000 } } }, // 費用の入っていないセンター
  ]));
  assert.equal(all.metrics.adPerNew, 10000);  // 5万 ÷ 5人（20人は入れない）
  assert.equal(all.metrics.stockRate, 10);    // 2万 ÷ 20万
  assert.equal(all.metrics.salesPerCost, 200000 / 70000);
});
