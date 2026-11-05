import test from "node:test";
import assert from "node:assert/strict";
import { parseCareForms, parsePatientCare } from "../lib/patient-care.js";
import { DEFAULT_ITEMS, itemsFor, autoValues } from "../lib/evaluation.js";

// 患者対応評価シートの形（評価日・所属院・対象スタッフ／評価項目と○×）
const form = (date, staff, marks, clinic = "茨木") => [
  ["あんど整骨院グループ｜患者対応評価シート"], [],
  ["評価日", date, "所属院", clinic, "対象スタッフ", staff],
  ["患者ID（匿名）", "A1", "評価者", "大皿", "通院段階", "2回目"], [],
  ["段階", "評価項目", "評価（○・×・対象外）", "補足", "反応", "改善"],
  ...marks.map((m, i) => ["来院・受付", `項目${i + 1}`, m]),
  [], ["○の数", "", 0], ["実施率（対象外除外）", "", "0%"],
];

test("患者対応評価：○÷（○＋×）、対象外と空欄は数えない", () => {
  const [f] = parseCareForms(form("2026/10/24", "定井", ["○", "×", "対象外", "", "〇"]));
  assert.equal(f.ok, 2); assert.equal(f.ng, 1); assert.equal(f.na, 1);
  assert.equal(f.rate, 66.7); assert.equal(f.month, "2026-10"); assert.equal(f.staff, "定井");
});

test("患者対応評価：タブごと・月ごとにスタッフ別の平均を出し、月次評価の自動項目に入る", () => {
  const people = [{ key: "定井彪雅", name: "定井 彪雅", clinics: ["茨木"], grade: "G2" }, { key: "大皿悠梨乃", name: "大皿 悠梨乃", clinics: ["茨木"], grade: "G4" }];
  const pc = parsePatientCare({
    "定井1": form("2026/10/02", "定井", ["○", "○", "○", "×"]),          // 75%
    "定井2": form("2026/10/20", "定井 彪雅", ["○", "○", "○", "○"]),     // 100%
    "書きかけ": form("", "", ["", ""]),
    "不明": form("2026/10/20", "山田", ["○"]),
  }, people);
  assert.equal(pc.forms, 2);
  assert.deepEqual(pc.unmatched, ["山田"]);
  const s = pc.byPerson.get("定井彪雅")["2026-10"];
  assert.equal(s.count, 2); assert.equal(s.rate, 87.5);
  const model = { fiscalYear: 2026, clinics: [], blocks: [], company: [] };
  const auto = autoValues(model, people[1], "2026-10", { patientCare: pc });
  assert.equal(auto.clinic_patient_care, 87.5);
  assert.equal(autoValues(model, people[0], "2026-10", { patientCare: pc }).patient_care, 87.5);
});

test("初期項目：G1〜G3に患者対応チェック、院長・副院長に平均通院回数（6回）", () => {
  for (const g of ["G1", "G2", "G3"]) assert.ok(itemsFor(DEFAULT_ITEMS, g).some((it) => it.auto === "patient_care"), g);
  for (const g of ["G3", "G4"]) {
    const v = itemsFor(DEFAULT_ITEMS, g).find((it) => it.id === "avg_visits");
    assert.equal(v.target, 6); assert.equal(v.unit, "回");
  }
});
