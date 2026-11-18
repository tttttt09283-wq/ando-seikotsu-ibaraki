// node --test test/*.test.js で実行（架空のデータ）
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = {};
vm.runInNewContext(readFileSync(new URL("../hq/hq-logic.js", import.meta.url), "utf8"), ctx);
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

// ===== 人員の適正判断（組織図 × 年間予算） =====
const orgGrid = (clinics, roleRows, rateRows = []) => [
  ["", "", ...clinics.map(() => "")],
  ["", "院名", ...clinics],
  ...roleRows.map(([role, ...names]) => ["", role, ...names]),
  ["", "ブロックマネージャー", "架空BM"],
  ["", "", ""],
  ...rateRows.map((r) => ["", r]),
];

test("parseOrgSheet：院ごとのメンバー・役割・目安の単価を読む", () => {
  const o = HQ.parseOrgSheet("2026.9.17〜（架空）", orgGrid(["東町院", "西町院"], [
    ["院長", "院長A", "院長B"], ["副院長", "", ""], ["施術者", "甲", "乙"], ["施術者", "中途", ""],
    ["時短施術者", "", "丙"], ["施術者(ア)", "丁", ""], ["受付", "", "戊"],
  ], ["施術者：800000"]));
  assert.equal(o.start, "2026-09-17");
  assert.equal(o.scenario, false);
  assert.deepEqual(plain(o.clinics.map((c) => c.key)), ["東町", "西町"]);
  assert.deepEqual(plain(HQ.roleCounts(o.clinics[0].members)), { "院長": 1, "施術者": 2, "施術者（ア）": 1 });
  assert.equal(o.rates["施術者"], 800000);
  // A：院長110万＋施術者80万×2＋ア30万 ／ B：院長110万＋施術者80万＋時短50万（受付は0）
  assert.equal(HQ.capacityOf(o.clinics[0].members, o.rates), 1_100_000 + 1_600_000 + 300_000);
  assert.equal(HQ.capacityOf(o.clinics[1].members, o.rates), 1_100_000 + 800_000 + 500_000);
  assert.equal(HQ.parseOrgSheet("出店時(理想)", orgGrid(["東町院"], [["院長", "x"]])).scenario, true);
  assert.equal(HQ.orgTabStart("20278店舗目出店時"), null);
  assert.equal(HQ.orgTabStart("2026.12(架空入社)"), "2026-12-01");
});

test("parseBudgetSheet：期間の行＝予算・1年前＝前年、実績の行、比率の行は読まない", () => {
  const months = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6].map((m) => `${m}月`);
  const grid = [
    ["", "年間予算", "", 999],
    ["", "", "", "", ...months],
    ["", "", "R8.7~R9.6", 12, 100, 110, 120, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ["", "", "R7.7~R8.6", 10, 90, 90, 90],
    ["", "", "予算前年比", 1.2, 1.1, 1.2, 1.3],
    ["", "東町院", "R8.7~R9.6", 1, 3_000_000, 3_000_000, 3_000_000],
    ["", "", "R7.7~R8.6", 1, 2_500_000, 2_600_000, 2_700_000],
    ["", "", "実績", 1, 3_300_000, "", ""],
    ["", "", "進捗率 / 達成率", 1, 1.1],
    ["", "西町", "R8.7~R9.6", 1, 2_000_000, 2_000_000, 2_000_000],
  ];
  const b = HQ.parseBudgetSheet("架空", grid);
  assert.equal(b.fy, 2026);
  assert.equal(b.hasActual, true);
  assert.deepEqual(plain(b.clinics.map((c) => c.key)), ["全社", "東町", "西町"]);
  assert.deepEqual(plain(b.clinics[1].months[7]), { budget: 3_000_000, lastYear: 2_500_000, actual: 3_300_000 });
  assert.equal(b.clinics[1].months[8].actual, null);
  assert.equal(b.clinics[2].months[9].budget, 2_000_000);
});

test("orgTabForMonth：月初までに始まった最新のタブ。月の途中の切り替えも返す", () => {
  const tabs = ["2026.7", "2026.9.1〜", "2026.9.17〜", "2026.12(入社)", "理想"].map((t) => HQ.parseOrgSheet(t, orgGrid(["東町院"], [["院長", "x"]])));
  assert.equal(HQ.orgTabForMonth(tabs, "2026-08").tab.title, "2026.7");
  const sep = HQ.orgTabForMonth(tabs, "2026-09");
  assert.equal(sep.tab.title, "2026.9.1〜");
  assert.deepEqual(plain(sep.changes.map((t) => t.title)), ["2026.9.17〜"]);
  assert.equal(HQ.orgTabForMonth(tabs, "2027-03").tab.title, "2026.12(入社)");
  assert.equal(HQ.orgTabForMonth(tabs, "2026-06").tab, null);
});

test("fitMonth：予算÷目安で 人員不足・適正・人員に余裕・未配置 を判定する", () => {
  const org = HQ.parseOrgSheet("2026.7", orgGrid(["東町院", "西町院", "南町院", "北町院"], [
    ["院長", "a", "b", "c", ""], ["施術者", "a1", "b1", "c1", ""], ["施術者", "a2", "", "", ""],
  ]));
  // 目安：A=290万 B=200万 C=200万 D=0
  const budget = { fy: 2026, clinics: [
    { key: "全社", name: "全社", months: { 7: { budget: 1, lastYear: null, actual: null } } },
    { key: "東町", name: "東町", months: { 7: { budget: 3_500_000, lastYear: null, actual: 2_000_000 } } }, // 121% → 不足
    { key: "西町", name: "西町", months: { 7: { budget: 2_100_000, lastYear: null, actual: null } } },    // 105% → 適正
    { key: "南町", name: "南町", months: { 7: { budget: 1_500_000, lastYear: null, actual: null } } },    // 75% → 余裕
    { key: "北町", name: "北町", months: { 7: { budget: 1_000_000, lastYear: null, actual: null } } },    // 人がいない
    { key: "中町", name: "中町", months: { 7: { budget: null, lastYear: null, actual: null } } },         // 人も予算もない → 出さない
  ] };
  const r = HQ.fitMonth({ org, budget, month: 7, tol: 0.1 });
  const by = Object.fromEntries(r.rows.map((x) => [x.key, x]));
  assert.deepEqual(plain(r.rows.map((x) => x.key)), ["東町", "西町", "南町", "北町"]);
  assert.equal(by["東町"].verdict.id, "short");
  assert.equal(by["東町"].gap, 600_000);
  assert.equal(by["東町"].staffGap, 0.7);
  assert.ok(by["東町"].advice.some((t) => /売上が届いていません/.test(t))); // 実績は目安の69%
  assert.equal(by["西町"].verdict.id, "ok");
  assert.equal(by["南町"].verdict.id, "surplus");
  assert.equal(by["北町"].verdict.id, "nostaff");
  assert.equal(r.total.capacity, 6_900_000);
  assert.equal(r.total.budget, 8_100_000);
  // 判定の幅を広げると B・C の判定が変わる
  assert.equal(HQ.fitMonth({ org, budget, month: 7, tol: 0.3 }).rows.find((x) => x.key === "南町").verdict.id, "ok");
  assert.equal(HQ.fitVerdict(null, 100, 0.1).id, "nobudget");
});

test("laborPlan：院ごとに 人件費×倍率＝売上設定 を出し、予算と比べる", () => {
  const budget = { fy: 2026, clinics: [
    { key: "東町", name: "東町", months: { 11: { budget: 3_000_000, lastYear: null, actual: 2_700_000 } } },
    { key: "西町", name: "西町", months: { 11: { budget: 2_000_000, lastYear: null, actual: null } } },
    { key: "南町", name: "南町", months: { 11: { budget: 4_000_000, lastYear: null, actual: null } } },
  ] };
  const people = [
    { name: "甲", clinic: "東町院", avg: 600_000 }, { name: "乙", clinic: "東町院", avg: 400_000 }, // 100万×3＝300万 → 予算300万で適正
    { name: "丙", clinic: "西町院", avg: 1_000_000 },                                               // 300万 → 予算200万は低め
    { name: "丁", clinic: "南町院", avg: 1_000_000 },                                               // 300万 → 予算400万は高め
    { name: "本部", clinic: "", avg: 500_000 },
  ];
  const r = HQ.laborPlan({ people, multiplier: 3, budget, month: 11, tol: 0.1, clinicNames: ["東町院", "西町院", "南町院"] });
  const by = Object.fromEntries(r.rows.map((x) => [x.key, x]));
  assert.equal(by["東町"].target, 3_000_000);
  assert.equal(by["東町"].verdict.id, "ok");
  assert.equal(by["東町"].actualLaborRate, 1_000_000 / 2_700_000);
  assert.equal(by["西町"].verdict.id, "low");
  assert.equal(by["西町"].laborRate, 0.5);
  assert.equal(by["南町"].verdict.id, "high");
  assert.equal(r.total.labor, 3_000_000);
  assert.equal(r.total.unassigned, 500_000);
  assert.equal(r.total.companyTarget, 10_500_000);
  assert.equal(HQ.laborPlan({ people, multiplier: "", budget, month: 11, clinicNames: [] }).mult, 3);
});

test("問題点：組織図の「問題点」列を読み、院を推測し、本部で追加した分とまとめる", () => {
  const grid = orgGrid(["東町院", "西町院"], [["院長", "a", "b"], ["施術者", "c", ""]]);
  grid[1].push("", "問題点");
  grid[2].push("", "東町の土日");
  grid[3].push("", "東町・西町の余剰人員");
  const o = HQ.parseOrgSheet("2026.12(異動案)", grid);
  assert.deepEqual(plain(o.issues), ["東町の土日", "東町・西町の余剰人員"]);
  assert.equal(o.clinics.length, 2); // 問題点の列は院として読まない（院名の列は空欄で終わる）
  const fitDoc = {
    sheetIssues: { [HQ.issueId("2026.12(異動案)", "東町の土日")]: { status: "対応中", memo: "土日シフト調整" } },
    issues: [{ id: "i1", tab: "2026.12(異動案)", text: "西町の受付", clinic: "", status: "未対応" }],
  };
  const all = HQ.mergeIssues([o], fitDoc, ["東町院", "西町院"]);
  assert.equal(all.length, 3);
  assert.equal(all[0].status, "対応中");
  assert.equal(all[0].memo, "土日シフト調整");
  assert.deepEqual(plain(all[1].clinics), ["東町院", "西町院"]);
  assert.equal(all[2].source, "hq");
  assert.deepEqual(plain(all[2].clinics), ["西町院"]);
  assert.equal(HQ.issueId("a", "b"), HQ.issueId("a", "b"));
  assert.notEqual(HQ.issueId("a", "b"), HQ.issueId("a", "c"));
});
