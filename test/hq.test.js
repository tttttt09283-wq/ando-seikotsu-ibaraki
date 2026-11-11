// node --test test/*.test.js で実行（架空のデータ）
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = {};
vm.runInNewContext(readFileSync(new URL("../hq-logic.js", import.meta.url), "utf8"), ctx);
const HQ = ctx.HQ;
const plain = (v) => JSON.parse(JSON.stringify(v));

const model = {
  latestMonth: 8,
  clinics: [
    { name: "A院", manager: "架空 院長", bm: "架空BM", fixedLabor: 1_500_000, laborRate: 0.5,
      months: [{ month: 7, budget: 3_000_000, actual: 3_300_000 }, { month: 8, budget: 3_000_000, actual: 2_100_000 }, { month: 9, budget: 3_000_000, actual: null }] },
    { name: "B院", manager: null, bm: null, fixedLabor: 800_000, laborRate: 0.3,
      months: [{ month: 7, budget: 2_000_000, actual: 2_000_000 }, { month: 8, budget: 2_000_000, actual: 2_000_000 }, { month: 9, budget: 2_000_000, actual: null }] },
  ],
  blocks: [{ bmName: "架空", clinics: ["A院"], personKey: "架空BM" }],
  people: [
    { key: "架空GM", name: "架空 GM", grade: "G6", clinics: [] },
    { key: "架空BM", name: "架空 BM", grade: "G5", clinics: ["A院"] },
    { key: "架空院長", name: "架空 院長", grade: "G4", clinics: ["A院"] },
    { key: "架空一般", name: "架空 一般", grade: "G2", clinics: ["A院"] },
    { key: "架空新人", name: "架空 新人", grade: "G1", clinics: ["B院"] },
    { key: "架空パート", name: "架空 パート", grade: "-P1", clinics: ["B院"] },
    { key: "架空無所属", name: "架空 無所属", grade: "G2", clinics: [] },
  ],
  company: [{ label: "上期", monthsElapsed: 2, sales: 9_400_000, labor: 4_200_000, laborRate: 0.447, cap: 3_948_000, room: -252_000 }],
};

test("年度の月（7月始まり）", () => {
  assert.equal(HQ.fiscalYearOf("2026-11"), 2026);
  assert.equal(HQ.fiscalYearOf("2027-03"), 2026);
  const keys = HQ.fiscalMonthKeys(2026);
  assert.equal(keys[0], "2026-07");
  assert.equal(keys[11], "2027-06");
  assert.equal(HQ.monthKeyInFiscal(2026, 2), "2027-02");
  assert.equal(HQ.dueDateOf("2026-02", 31), "2026-02-28");
});

test("業績：実績がある月までの累計と達成率", () => {
  const p = HQ.performance(model.clinics, model.latestMonth);
  const a = p.rows.find((r) => r.name === "A院");
  assert.equal(a.budget, 6_000_000);
  assert.equal(a.actual, 5_400_000);
  assert.equal(a.rate, 0.9);
  assert.equal(a.yearBudget, 9_000_000);
  assert.equal(a.latest.rate, 0.7);
  assert.equal(p.total.actual, 9_400_000);
  assert.equal(p.monthly[2].actual, null); // 9月は実績なし
  assert.equal(p.latest.actual, 4_100_000);
});

test("集客：初めて来た日で新患を数える（キャンセル・練習は除く）", () => {
  const bookings = [
    { patient_name: "架空 花子", date: "2026-10-03", store_id: 1, how_know: "Instagram" },
    { patient_name: "架空　花子", date: "2026-11-01", store_id: 1, how_know: "" },
    { patient_name: "架空 次郎", date: "2026-11-02", store_id: 2, how_know: "チラシ、紹介" },
    { patient_name: "架空 三郎", date: "2026-11-05", store_id: 1, cancelled: true },
    { patient_name: "練習 患者", date: "2026-11-05", store_id: 1, is_training: true },
  ];
  const rows = plain(HQ.newPatients(bookings, { 1: "香里園", 2: "茨木" }));
  assert.deepEqual(rows.map((r) => [r.month, r.total]), [["2026-10", 1], ["2026-11", 1]]);
  assert.deepEqual(rows[1].byChannel, { チラシ: 1, 紹介: 1 });
  assert.deepEqual(rows[1].byStore, { 茨木: 1 });
});

test("集客：施策の CPA", () => {
  const s = HQ.campaignStats([
    { channel: "チラシ", cost: 50000, acquired: 5 },
    { channel: "チラシ", cost: 30000, acquired: 3 },
    { channel: "Web広告", cost: 20000, acquired: 0 },
  ]);
  assert.equal(s.cost, 100000);
  const flyer = s.channels.find((c) => c.channel === "チラシ");
  assert.equal(flyer.cpa, 10000);
  assert.equal(s.channels.find((c) => c.channel === "Web広告").cpa, null);
});

test("組織図：GM → BMエリア → 院 → 院長・スタッフ、エリア外は直轄", () => {
  const org = plain(HQ.buildOrg(model, { ceo: "架空 社長" }));
  assert.equal(org.ceo, "架空 社長");
  assert.deepEqual(org.gms.map((p) => p.name), ["架空 GM"]);
  assert.equal(org.areas[0].bmName, "架空 BM");
  const a = org.areas[0].clinics[0];
  assert.equal(a.name, "A院");
  assert.deepEqual(a.managers.map((p) => p.name), ["架空 院長"]);
  assert.deepEqual(a.staff.map((p) => p.name), ["架空 一般"]);
  assert.deepEqual(org.direct.map((c) => c.name), ["B院"]);
  assert.deepEqual(org.direct[0].staff.map((p) => p.name), ["架空 新人", "架空 パート"]);
  assert.deepEqual(org.others.map((p) => p.name), ["架空 無所属"]);
});

test("人材：等級の人数・院の過不足・採用の段階", () => {
  const c = HQ.gradeCounts(model.people);
  assert.equal(c.G2, 2);
  assert.equal(c["-P"], 1);
  const st = plain(HQ.staffing(model.people, ["A院", "B院"], { "A院": 5 }));
  assert.deepEqual(st[0], { name: "A院", count: 3, need: 5, gap: -2 });
  assert.equal(st[1].need, null);
  const f = HQ.recruitFunnel([{ status: "面接" }, { status: "面接" }, { status: "入社" }, { status: "?" }]);
  assert.equal(f["面接"], 2);
  assert.equal(f["応募"], 1);
});

test("キャリア：昇格候補", () => {
  const l = plain(HQ.careerLadder(model.people, { "架空一般": { target: "G3", memo: "個人売上3ヶ月連続達成" } }));
  const g3 = l.find((g) => g.id === "G3");
  assert.equal(g3.candidates[0].name, "架空 一般");
  assert.equal(l.find((g) => g.id === "G2").count, 2);
});

test("出店計画：進み具合・次のマイルストーン・期限切れ", () => {
  const p = { openDate: "2027-04-01", milestones: [
    { title: "物件", due: "2026-10-01", done: true },
    { title: "資金", due: "2026-11-01", done: false },
    { title: "内装", due: "2027-01-01", done: false },
  ] };
  const pr = plain(HQ.expansionProgress(p, "2026-11-11"));
  assert.equal(pr.done, 1);
  assert.equal(pr.next.title, "資金");
  assert.equal(pr.overdue, 1);
  assert.equal(pr.daysToOpen, 141);
  assert.equal(HQ.newMilestones("s1").length, HQ.DEFAULT_MILESTONES.length);
});

test("教育：対象の等級と受講率", () => {
  const s = plain(HQ.trainingStats([
    { id: "t1", status: "実施済み", target: "", attendees: ["架空一般"] },
    { id: "t2", status: "予定", target: "G1, G2", attendees: [] },
    { id: "t3", status: "中止", target: "", attendees: [] },
  ], model.people));
  assert.equal(s.done, 1);
  const ippan = s.perPerson.find((p) => p.key === "架空一般");
  assert.deepEqual([ippan.target, ippan.attended], [2, 1]);
  const gm = s.perPerson.find((p) => p.key === "架空GM");
  assert.equal(gm.target, 1);
});

test("経理・事務：毎月の定例と期限切れ", () => {
  const r = plain(HQ.routineStatus([{ id: "a", title: "レセ", day: 10 }, { id: "b", title: "給与", day: 20 }], { "2026-11": { a: true } }, "2026-11", "2026-11-25"));
  assert.deepEqual(r.map((x) => [x.id, x.done, x.overdue]), [["a", true, false], ["b", false, true]]);
});

test("ダッシュボード：アラートをまとめる", () => {
  const perf = HQ.performance(model.clinics, model.latestMonth);
  const a = plain(HQ.alerts({
    model, perf, todayStr: "2026-11-25", monthKey: "2026-11",
    docs: {
      accounting: { routines: [{ id: "b", title: "給与", day: 20 }], done: {} },
      expansion: { plans: [{ name: "新店", status: "物件探し", milestones: [{ title: "物件", due: "2026-11-01", done: false }] }] },
      people: { headcount: { "B院": 4 } },
      annual: { events: [{ month: "2026-11", title: "忘年会", done: false }] },
    },
  }));
  const texts = a.map((x) => x.text).join("\n");
  assert.match(texts, /A院：最新月の予算達成率が 70%/);
  assert.match(texts, /A院：人件費率 50%/);
  assert.match(texts, /全社の人件費率が 44.7%/);
  assert.match(texts, /期限切れ 1件：給与/);
  assert.match(texts, /出店「新店」/);
  assert.match(texts, /B院：必要人数より 2名 不足/);
  assert.match(texts, /忘年会/);
  assert.equal(a[0].level, "ng");
  assert.equal(a[a.length - 1].level, "info");
});
