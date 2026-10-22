// node --test test/*.test.js で実行（架空のデータ）
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ITEMS, EVALUATED_GRADES, itemsFor, itemSheetRows, parseItemSheet, numberPoints, scoreMonth, parseRecords, buildRecordRows,
  RECORD_HEADER, halfMonthKeys, parseMonthKey, superiorOf, canEvaluate,
} from "../lib/evaluation.js";

test("every grade's items (incl. common basics) total 100 points, PC is required from G4 up", () => {
  for (const grade of EVALUATED_GRADES) {
    const items = itemsFor(DEFAULT_ITEMS, grade);
    assert.equal(items.reduce((a, i) => a + i.points, 0), 100, grade);
    assert.equal(items.filter((i) => i.kind === "基本").reduce((a, i) => a + i.points, 0), 15, grade);
    const pc = items.find((i) => i.id === "pc");
    assert.ok(pc, `${grade} has PC item`);
    assert.equal(pc.required, ["G4", "G5", "G6"].includes(grade), grade);
  }
});

test("item sheet round-trips", () => {
  assert.deepEqual(parseItemSheet(itemSheetRows()), DEFAULT_ITEMS);
});

test("number points: 以上 is capped ratio, 以下 drops to 0 at target+10", () => {
  const up = { points: 10, target: 100, direction: "以上" };
  assert.equal(numberPoints(up, 50), 5);
  assert.equal(numberPoints(up, 150), 10);
  const down = { points: 20, target: 42, direction: "以下" };
  assert.equal(numberPoints(down, 40), 20);
  assert.equal(numberPoints(down, 47), 10);
  assert.equal(numberPoints(down, 60), 0);
});

test("scoreMonth: behavior = points x score/5, rank only when complete, required flag", () => {
  const items = itemsFor(DEFAULT_ITEMS, "G4");
  const values = { clinic_budget: 100, clinic_labor: 40, new_count: 10, new_close: 70, new_sales: 200000, clinic_continue_rate: 75 };
  const scores = { pl: 5, shift: 5, claim: 5, develop: 5, pc: 2,
    basic_greeting: 5, basic_appearance: 5, basic_punctual: 2, basic_hourensou: 5, basic_rules: 5 };
  const r = scoreMonth(items, values, scores);
  assert.equal(r.total, 94.6); // 行動30%÷5項目＝PC 6点 × 2/5（-3.6）、基本15%÷5項目＝時間厳守 3点 × 2/5（-1.8）
  assert.equal(r.rank, "S");
  assert.deepEqual(r.requiredMissed, ["PC業務（必須）"]);
  assert.deepEqual(r.basicIssues, ["時間厳守・無遅刻無欠勤"]);
  const partial = scoreMonth(items, values, {});
  assert.equal(partial.rank, null);
  assert.equal(partial.complete, false);
});

test("records: new rows are appended, existing rows are updated in place", () => {
  const person = { name: "山田 太郎", key: "山田太郎", grade: "G2", clinics: ["A"] };
  const items = itemsFor(DEFAULT_ITEMS, "G2");
  const first = buildRecordRows({ monthKey: "2027-01", person, items, values: { continue_rate: 75 }, scores: { pc: 4 }, comment: "ok", evaluator: "上司", now: "t", existing: null });
  assert.equal(first.updates.length, 0);
  assert.equal(first.appends.length, items.length + 2);
  const sheet = [RECORD_HEADER, ...first.appends];
  const map = parseRecords(sheet);
  const rec = map.get("2027-01|山田太郎");
  assert.equal(rec.values.continue_rate, 75);
  assert.equal(rec.scores.pc, 4);
  assert.equal(rec.comment, "ok");
  const second = buildRecordRows({ monthKey: "2027-01", person, items, values: {}, scores: { pc: 5 }, comment: "", evaluator: "上司", now: "t2", existing: rec });
  assert.equal(second.appends.length, 0);
  assert.equal(second.updates.length, items.length + 2);
});

test("month helpers", () => {
  assert.deepEqual(parseMonthKey("2027-01"), { year: 2027, month: 1, fiscalYear: 2026 });
  assert.deepEqual(halfMonthKeys("2027-03"), ["2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06"]);
  assert.equal(parseMonthKey("2027-13"), null);
});

test("direct superior: staff→院長, 院長→BM, BM→GM; no 院長 → BM", () => {
  const model = {
    people: [
      { key: "gm", name: "GM", grade: "G6", clinics: ["A"] },
      { key: "bm", name: "BM", grade: "G5", clinics: ["B"] },
      { key: "mgr", name: "院長", grade: "G4", clinics: ["A"] },
      { key: "s1", name: "スタッフA", grade: "G2", clinics: ["A"] },
      { key: "s2", name: "スタッフB", grade: "G1", clinics: ["B"] },
    ],
    blocks: [{ bmName: "BM", clinics: ["A", "B"], personKey: "bm" }],
  };
  const p = (k) => model.people.find((x) => x.key === k);
  assert.equal(superiorOf(model, p("s1")).key, "mgr");
  assert.equal(superiorOf(model, p("s2")).key, "bm");
  assert.equal(superiorOf(model, p("mgr")).key, "bm");
  assert.equal(superiorOf(model, p("bm")).key, "gm");
  assert.equal(superiorOf(model, p("gm")), null);
  assert.equal(canEvaluate(model, { personKey: "mgr", grade: "G4" }, false, p("s1")), true);
  assert.equal(canEvaluate(model, { personKey: "s1", grade: "G2" }, false, p("s1")), false);
  assert.equal(canEvaluate(model, { personKey: "mgr", grade: "G4" }, false, p("s2")), false);
});

test("validateItems: cleans input, keeps ids unique, requires target for 数値, 共通 is always 基本", async () => {
  const { validateItems } = await import("../lib/evaluation.js");
  const list = validateItems("G2", [
    { kind: "行動", id: "a", label: " 報連相 ", points: "5", note: "内容" },
    { kind: "数値", id: "a", label: "成約率", points: 10, target: "60%", unit: "%", direction: "以上", auto: "bogus" },
  ]);
  assert.equal(list[0].label, "報連相");
  assert.equal(list[0].points, 0); // 配点は評価配分から自動
  assert.notEqual(list[1].id, "a"); // 重複IDは振り直し
  assert.equal(list[1].target, 60);
  assert.equal(list[1].auto, "");
  assert.throws(() => validateItems("G2", [{ kind: "数値", label: "x", points: 5 }]), /目標値/);
  assert.throws(() => validateItems("G2", [{ kind: "行動", label: "", points: 5 }]), /空/);
  assert.throws(() => validateItems("G9", []), /クラス/);
  assert.equal(validateItems("共通", [{ kind: "数値", label: "挨拶", points: 3 }])[0].kind, "基本");
});

test("records keep the total saved at the time", () => {
  const person = { name: "山田 太郎", key: "山田太郎", grade: "G2", clinics: ["A"] };
  const items = itemsFor(DEFAULT_ITEMS, "G2");
  const { appends, result } = buildRecordRows({ monthKey: "2027-01", person, items, values: {}, scores: { pc: 5 }, comment: "", evaluator: "上司", now: "t", existing: null });
  const rec = parseRecords([RECORD_HEADER, ...appends]).get("2027-01|山田太郎");
  assert.equal(rec.storedTotal, result.total);
});

test("new-patient sheet: columns by header, nail cases excluded, surname matching, metrics", async () => {
  const { parseNewPatients, newPatientMetrics, parseSheetDate } = await import("../lib/new-patients.js");
  const people = [{ key: "山田太郎", name: "山田 太郎" }, { key: "佐藤花子", name: "佐藤 花子" }];
  const sheets = {
    "A院": [
      [],
      ["来院日（必須）", "問い合わせ経路", "成約金額（必須）", "症状（必須）", "初回施術担当者", "初回窓口金額", "自費加入", "通院"],
      [46296, "電話", 50000, "腰痛", "山田　太郎", 3000, "○", "○"],   // 2026-10-01（シリアル値）
      ["2026/10/15", "電話", "", "肩", "山田", 2000, "", "◯"],
      ["2026/10/20", "電話", "", "巻き爪", "山田", 1000, "", ""],      // 爪は除外
      ["2026/09/30", "電話", "", "膝", "佐藤", 4000, "", ""],
      ["2026/10/02", "電話", "", "膝", "応援", 4000, "", ""],
    ],
  };
  assert.deepEqual(parseSheetDate(46296), { year: 2026, month: 10 });
  const np = parseNewPatients(sheets, people);
  const m = newPatientMetrics(np.byPerson.get("山田太郎")["2026-10"]);
  assert.deepEqual(m, { nail_count: 1, nail_sales: 1000, new_count: 2, new_close: 50, new_sales: 55000, new_first_avg: 2500, new_continue: 100 });
  assert.equal(np.byPerson.get("佐藤花子")["2026-09"].count, 1);
  assert.equal(np.byClinic.get("A")["2026-10"].count, 3);
  assert.deepEqual(np.unmatched, ["応援"]);
});

test("class order and 院長候補 permissions", async () => {
  const { gradeRank, parseStaffSettings, canSetCandidate, STAFF_HEADER } = await import("../lib/evaluation.js");
  assert.deepEqual(["G1", "-R", "G6", "G3", "G4", "", "G5", "G2"].sort((a, b) => gradeRank(a) - gradeRank(b)), ["G6", "G5", "G4", "G3", "G2", "G1", "-R", ""]);
  const map = parseStaffSettings([STAFF_HEADER, ["山田 太郎", "○", "来期候補", "院長", "t"], ["佐藤 花子", "", "", "", ""]]);
  assert.equal(map.get("山田太郎").candidate, true);
  assert.equal(map.get("山田太郎").memo, "来期候補");
  assert.equal(map.get("佐藤花子").candidate, false);
  const model = {
    people: [
      { key: "gm", name: "GM", grade: "G6", clinics: ["A"] },
      { key: "mgr", name: "院長", grade: "G4", clinics: ["A"] },
      { key: "s1", name: "スタッフ", grade: "G3", clinics: ["A"] },
      { key: "s2", name: "別院", grade: "G2", clinics: ["B"] },
    ],
    blocks: [],
  };
  const p = (k) => model.people.find((x) => x.key === k);
  assert.equal(canSetCandidate(model, { personKey: "mgr", grade: "G4" }, false, p("s1")), true);  // 直属の上司
  assert.equal(canSetCandidate(model, { personKey: "mgr", grade: "G4" }, false, p("s2")), false); // 別院の院長
  assert.equal(canSetCandidate(model, { personKey: "s1", grade: "G3" }, false, p("s1")), false);  // 本人
  assert.equal(canSetCandidate(model, { personKey: "gm", grade: "G6" }, false, p("mgr")), false); // 院長以上は対象外
  assert.equal(canSetCandidate(model, { personKey: "gm", grade: "G6" }, false, p("s2")), true);
});

test("PIN login helpers: random pins avoid easy ones, tokens verify and expire, lockout after 5 misses", async () => {
  process.env.PIN_SESSION_SECRET = "test-secret";
  const { randomPin, issueToken, verifyToken, pinStamp, samePin, afterAttempt, isLocked, parseLoginSheet, LOGIN_HEADER, MAX_FAILS } = await import("../lib/pin-auth.js");
  for (let i = 0; i < 300; i++) {
    const p = randomPin();
    assert.match(p, /^\d{4}$/);
    assert.ok(!["0000", "1111", "1234", "4321", "9876"].includes(p));
  }
  const t = issueToken({ t: "person", k: "山田太郎", h: pinStamp("0123") });
  assert.equal(verifyToken(t).k, "山田太郎");
  assert.equal(verifyToken(t.slice(0, -2) + "xx"), null); // 改ざん
  assert.equal(verifyToken(issueToken({ t: "x" }, -1)), null); // 期限切れ
  assert.notEqual(pinStamp("0123"), pinStamp("0124"));
  assert.ok(samePin("0123", "0123") && samePin(123, "0123") && !samePin("0123", "0124") && !samePin("", ""));
  let e = { fails: 0, lockedUntil: 0 };
  for (let i = 0; i < MAX_FAILS; i++) e = afterAttempt(e, false, 1000);
  assert.ok(isLocked(e, 2000));
  assert.ok(!isLocked(afterAttempt(e, true), 2000));
  const sheet = parseLoginSheet([LOGIN_HEADER, ["院", "茨木", "IBARAKI", "", "0456", 0, "", ""], ["個人", "茨木", "", "山田 太郎", 789, 2, "", ""]]);
  assert.equal(sheet.clinics.get("茨木").clinicId, "ibaraki");
  assert.equal(sheet.people.get("山田太郎").pin, "0789");
  assert.equal(sheet.people.get("山田太郎").fails, 2);
});

test("career judgement: reasons for promotion and demotion, unknown months are not treated as 0%", async () => {
  const { judgeCareer, parseLadder, maskSensitive } = await import("../lib/career-judgement.js");
  const ladder = parseLadder([
    ["等級", "役職 / クラス", "固定", "基本給", "", "", "", "", "昇格要件（数値KPI）", "昇格要件（技術・スキル）", "昇格要件（行動・育成）", "降格・役職解任トリガー（客観基準）"],
    ["G3", "副院長", "", "", "", "", "", "", "個人売上100万円以上を3ヶ月連続達成", "自費フルメニュー", "代行業務", "個人売上65万円未満が3ヶ月連続"],
    ["G2", "一般", "", "", "", "", "", "", "個人売上70万円", "手技", "報連相", "次回予約率60%未満の継続"],
    [],
    ["G6", "GM", 400000, 450000],  // 下の給与レンジ表は読まない
  ]);
  assert.equal(ladder.G3.skill, "自費フルメニュー");
  assert.ok(ladder.G6.kpi.includes("営業利益")); // 既定の文言のまま
  const model = { fiscalYear: 2026, latestMonth: 9, clinics: [], blocks: [] };
  const sales = (a, b, c) => [{ month: 7, total: a }, { month: 8, total: b }, { month: 9, total: c }];
  const ctx = (np) => ({ model, np, records: new Map(), monthKey: "2026-09", halfKeys: ["2026-07", "2026-08", "2026-09"], ladder });
  const npMap = (stats) => ({ byPerson: new Map([["p", stats]]), byClinic: new Map() });

  // G3 が65万未満3ヶ月連続 → 降格対象
  const down = judgeCareer({ key: "p", grade: "G3", clinics: ["A"], monthlySales: sales(600000, 640000, 500000) }, ctx(null));
  assert.equal(down.level, "down");
  assert.match(down.reasons[0].text, /65万円未満が3ヶ月連続/);

  // G2 で売上100万×3・成約率と初回売上も達成 → 数値条件はそろう（評価なしなので昇格候補にはならない）
  const s = { count: 5, closed: 4, firstPay: 100000, contract: 100000, continued: 4, closeBase: 5, contBase: 5 };
  const g2 = judgeCareer({ key: "p", grade: "G2", clinics: ["A"], monthlySales: sales(1100000, 1200000, 1050000) }, ctx(npMap({ "2026-09": s })));
  assert.equal(g2.promotion.find((c) => c.label.includes("3ヶ月連続")).status, "ok");
  assert.equal(g2.promotion.find((c) => c.label.includes("半期の評価")).status, "unknown");
  assert.equal(g2.level, "keep");

  // 通院を記入していない月（contBase 0）は継続率 0% として数えない
  const blank = { count: 6, closed: 0, firstPay: 30000, contract: 0, continued: 0, closeBase: 0, contBase: 0 };
  const g2b = judgeCareer({ key: "p", grade: "G2", clinics: ["A"], monthlySales: sales(700000, 700000, 700000) }, ctx(npMap({ "2026-07": blank, "2026-08": blank, "2026-09": blank })));
  assert.equal(g2b.demotion[0].status, "unknown");
  assert.notEqual(g2b.level, "down");

  // 人件費の数字は伏せられる
  const masked = maskSensitive({ promotion: [{ label: "人件費率", status: "ng", detail: "45%", sensitive: true }], demotion: [], reasons: [{ tone: "ng", text: "【降格】人件費率：45%", sensitive: true }] }, false);
  assert.ok(!masked.promotion[0].detail.includes("45"));
  assert.ok(!masked.reasons[0].text.includes("45"));
});

test("departments: default members by surname, items added with dept tag, sheet column overrides defaults", async () => {
  const { deptMembership, itemsFor, departmentNames, validateItems, parseStaffSettings, STAFF_HEADER, DEPT_PREFIX } = await import("../lib/evaluation.js");
  const model = { people: [
    { key: "岩永拓己", name: "岩永 拓己", grade: "G6", clinics: ["茨木"] },
    { key: "大皿悠梨乃", name: "大皿 悠梨乃", grade: "G4", clinics: ["茨木"] },
    { key: "藤原俊介", name: "藤原 俊介", grade: "G5", clinics: ["交野"] },
  ] };
  assert.ok(departmentNames(DEFAULT_ITEMS).includes("巻き爪"));
  const m = deptMembership(model, new Map(), DEFAULT_ITEMS);
  assert.deepEqual(m.get("岩永拓己"), ["教育・業績UP"]);
  assert.deepEqual(m.get("大皿悠梨乃"), ["集客", "巻き爪"]);
  assert.deepEqual(m.get("藤原俊介"), ["商品開発", "ES（従業員満足）", "巻き爪"]);
  const items = itemsFor(DEFAULT_ITEMS, "G4", m.get("大皿悠梨乃"));
  assert.ok(items.some((it) => it.dept === "巻き爪" && it.auto === "nail_count"));
  assert.ok(items.filter((it) => it.dept).every((it) => it.points > 0));
  const sheet = parseStaffSettings([STAFF_HEADER, ["大皿 悠梨乃", "", "", "", "", "集客"]]);
  assert.deepEqual(deptMembership(model, sheet, DEFAULT_ITEMS).get("大皿悠梨乃"), ["集客"]);
  assert.equal(deptMembership(model, sheet, DEFAULT_ITEMS).get("岩永拓己"), undefined); // 部門列があればシートが優先
  assert.equal(validateItems(DEPT_PREFIX + "広報", [{ kind: "行動", label: "SNS発信", points: 5 }])[0].kind, "行動");
  assert.throws(() => validateItems("部門:", []), /クラス・部門/);
});

test("events: parse rows, bonus per person-month, rewards added to incentives and the 42% cost", async () => {
  const { parseEvents, eventBonusMap, groupEvents, attachEventsToModel, EVENT_HEADER } = await import("../lib/events.js");
  const people = [{ key: "山田太郎", name: "山田 太郎", clinics: ["A"], incentives: [] }];
  const rows = [EVENT_HEADER,
    ["2026/11/3", "技術コンテスト", "山田", "優勝", 5, 50000, "", "", ""],
    ["2026-11-20", "清掃大会", "山田 太郎", "参加", 30, "1,000", "", "", ""],   // 加点は20まで
    ["", "", "", "", "", "", "", "", ""]];
  const ev = parseEvents(rows, people);
  assert.equal(ev.length, 2);
  assert.equal(ev[0].date, "2026-11-03");
  assert.equal(ev[1].bonus, 20);
  assert.equal(eventBonusMap(ev).get("2026-11|山田太郎"), 25);
  assert.equal(groupEvents(ev)[0].name, "清掃大会");
  const model = { fiscalYear: 2026, people, company: [{ key: "H1", incentivePaid: 100000, roomProjected: 1000000, sales: 1e7, labor: 4e6, monthsElapsed: 6 }, { key: "H2", incentivePaid: 0 }] };
  attachEventsToModel(model, ev);
  assert.equal(model.company[0].eventRewards, 51000);
  assert.equal(model.company[0].incentivePaid, 151000);
  assert.equal(Math.round(model.company[0].incentiveCost), Math.round(151000 * 1.15));
  assert.equal(people[0].incentives.filter((i) => i.type === "event").length, 2);
});

test("evaluation rate = earned points / max points (department items included, no 100-point cap on totals)", async () => {
  const { scoreMonth, itemsFor } = await import("../lib/evaluation.js");
  const items = itemsFor(DEFAULT_ITEMS, "G2", ["集客"]);
  const scores = {}, values = {};
  for (const it of items) { if (it.kind === "数値") values[it.id] = (it.target || 1) * 2; else scores[it.id] = it.dept ? 1 : 5; }
  const r = scoreMonth(items, values, scores);
  assert.equal(r.max, 110);           // クラス100（45+40+15）＋部門10
  assert.equal(r.earned, 102);        // 部門は1/5（10点中2点）
  assert.equal(r.total, 92.7);        // 102 ÷ 110
  assert.equal(r.rank, "S");
});

test("distribution: % split equally by item count, stricter required line for higher classes, validation", async () => {
  const { itemsFor, parseDist, distRows, validateDist, DEFAULT_DIST, scoreMonth } = await import("../lib/evaluation.js");
  const dist = parseDist(distRows({ ...DEFAULT_DIST, grades: { ...DEFAULT_DIST.grades, G2: { num: 60, beh: 25, basic: 15, line: 4 } }, depts: { 集客: 20 } }));
  const items = itemsFor(DEFAULT_ITEMS, "G2", ["集客"], dist);
  const nums = items.filter((it) => !it.dept && it.kind === "数値");
  assert.ok(nums.every((it) => Math.abs(it.points - 60 / nums.length) < 1e-9));
  assert.equal(items.filter((it) => it.dept).reduce((a, it) => a + it.points, 0), 20);
  assert.equal(items[0].requiredMin, 4);
  assert.ok(DEFAULT_DIST.grades.G6.line > DEFAULT_DIST.grades.G1.line);
  assert.equal(validateDist("クラス", { num: 50, beh: 40, basic: 20, line: 3 }).num, 50); // 合計100でなくてよい
  assert.throws(() => validateDist("クラス", { num: 0, beh: 0, basic: 0, line: 3 }), /どれか/);
  assert.equal(validateDist("部門", { points: 15 }).points, 15);
  // 必須ラインより低いと必須未達
  const pc = items.find((it) => it.id === "pc");
  const r = scoreMonth(items.map((it) => (it.id === "pc" ? { ...it, required: true } : it)), {}, { pc: 3 });
  assert.deepEqual(r.requiredMissed, [pc.label]);
});
