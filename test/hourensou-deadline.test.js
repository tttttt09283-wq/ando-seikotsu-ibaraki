// 報連相・期日もの（2026-11 追加）：月次評価の「基本」と、マニュアル・育成カリキュラムへの反映（架空のデータ）
import test from "node:test";
import assert from "node:assert/strict";
import { COMMON_GRADE, DEFAULT_ITEMS, REVISED_DEFAULTS, itemSheetRows, parseItemSheet, withAddedDefaults, itemsFor, DEFAULT_DIST } from "../lib/evaluation.js";
import {
  DEFAULT_MANUAL, DEFAULT_CURRICULUM, parseManual, manualRows, parseCurriculum, curriculumRows, withAddedManual, withAddedCurriculum,
  readStatus, evaluationMap,
} from "../lib/manual.js";

const ids = (list) => list.map((x) => x.id);

// 期日ものを入れる前の「共通」（前の初期値そのもの）
const oldCommon = () => [
  ...DEFAULT_ITEMS[COMMON_GRADE].filter((it) => it.id !== "basic_deadline").map((it) =>
    REVISED_DEFAULTS[it.id] ? { ...it, label: REVISED_DEFAULTS[it.id].from.label, note: REVISED_DEFAULTS[it.id].from.note } : it),
];

test("月次評価：初期値の「基本」に報連相と期日ものがあり、期日ものは報連相の次", () => {
  const c = ids(DEFAULT_ITEMS[COMMON_GRADE]);
  assert.ok(c.includes("basic_hourensou") && c.includes("basic_deadline"));
  assert.equal(c.indexOf("basic_deadline"), c.indexOf("basic_hourensou") + 1);
  const d = DEFAULT_ITEMS[COMMON_GRADE].find((it) => it.id === "basic_deadline");
  assert.equal(d.kind, "基本");
  assert.match(d.note, /3日後の23:59/);
  assert.match(d.note, /有給休暇の取得.*評価しない/);
});

test("月次評価：期日ものが無い台帳のシートには足し、前の初期値のままの説明は新しくする", () => {
  const sheet = parseItemSheet(itemSheetRows({ ...DEFAULT_ITEMS, [COMMON_GRADE]: oldCommon() }));
  assert.ok(!ids(sheet[COMMON_GRADE]).includes("basic_deadline"));
  const items = withAddedDefaults(sheet);
  const c = items[COMMON_GRADE];
  assert.deepEqual(ids(c).slice(3, 6), ["basic_hourensou", "basic_deadline", "basic_rules"]);
  assert.equal(c.find((it) => it.id === "basic_rules").label, "約束・ルールを守る");
  assert.match(c.find((it) => it.id === "basic_hourensou").note, /【5】/);
  // 全クラスの評価に「基本」として入る（配点は基本％を項目数で等分）
  const g1 = itemsFor(items, "G1", [], DEFAULT_DIST).filter((it) => it.kind === "基本");
  assert.equal(g1.length, 6);
  assert.ok(g1.some((it) => it.id === "basic_deadline" && it.points > 0));
});

test("月次評価：院で書き換えた名前・説明は上書きしない。2回目に読んでも重複しない", () => {
  const custom = oldCommon().map((it) => (it.id === "basic_rules" ? { ...it, note: "院で書き換えた説明" } : it));
  const items = withAddedDefaults(withAddedDefaults(parseItemSheet(itemSheetRows({ ...DEFAULT_ITEMS, [COMMON_GRADE]: custom }))));
  const rules = items[COMMON_GRADE].find((it) => it.id === "basic_rules");
  assert.equal(rules.label, "約束・期限・ルールを守る");
  assert.equal(rules.note, "院で書き換えた説明");
  assert.equal(ids(items[COMMON_GRADE]).filter((x) => x === "basic_deadline").length, 1);
});

test("マニュアル：期日もの（共通・社会人）を報連相の次に足し、評価の「期日もの」と結びつく", () => {
  const old = DEFAULT_MANUAL.filter((m) => m.id !== "c_deadline").map((m) =>
    m.id === "c_hourensou" ? { ...m, body: "報告は結論から。悪い報告ほど早く。迷ったら相談。決められた相手に、決められたタイミングで行います。" }
      : m.id === "c_rules" ? { ...m, title: "約束・期限・ルールを守る", body: "提出物の期限、患者様との約束、院のルール・整理整頓を守ります。守れないときは事前に相談します。" } : m);
  const sheet = parseManual(manualRows(old));
  const out = withAddedManual(sheet);
  const common = ids(out.filter((m) => m.grade === "共通"));
  assert.equal(common.indexOf("c_deadline"), common.indexOf("c_hourensou") + 1);
  assert.equal(out.find((m) => m.id === "c_rules").title, "約束・ルールを守る");
  assert.match(out.find((m) => m.id === "c_hourensou").body, /ODコール/);
  // 保存しても同じ（並び順は小数でもよい）・2回目は何もしない
  assert.deepEqual(ids(withAddedManual(parseManual(manualRows(out)))), ids(out));
  // 読んだ人には「更新あり」
  const reads = new Map([["k|共通", { at: "2026-11-20 10:00" }]]);
  assert.equal(readStatus(reads, out, "k", "共通").state, "更新あり");
  // 評価の「期日もの」と対応する
  const map = evaluationMap(withAddedDefaults(DEFAULT_ITEMS), out, "G1");
  assert.ok(JSON.stringify(map).includes("basic_deadline"));
});

test("マニュアル：書き換えてある報連相はそのまま", () => {
  const sheet = parseManual(manualRows(DEFAULT_MANUAL.map((m) => (m.id === "c_hourensou" ? { ...m, body: "院の書き方" } : m))));
  assert.equal(withAddedManual(sheet).find((m) => m.id === "c_hourensou").body, "院の書き方");
});

test("育成カリキュラム：新人に「期日もの」、副院長に「議事録」のステップを足す", () => {
  const old = DEFAULT_CURRICULUM.filter((s) => !["n_deadline", "g3_minutes"].includes(s.id));
  const out = withAddedCurriculum(parseCurriculum(curriculumRows(old)));
  const g1 = ids(out.filter((s) => s.grade === "G1"));
  assert.equal(g1.indexOf("n_deadline"), g1.indexOf("n_hourensou") + 1);
  const minutes = out.find((s) => s.id === "g3_minutes");
  assert.equal(minutes.grade, "G3");
  assert.match(minutes.criterion, /3日後の23:59/);
  assert.equal(withAddedCurriculum(out).length, out.length);
});
