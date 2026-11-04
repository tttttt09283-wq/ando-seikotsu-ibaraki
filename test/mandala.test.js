import test from "node:test";
import assert from "node:assert/strict";
import {
  achievement, defaultMandala, parseMandala, mandalaFor, parseRuns, validateCell, buildChart, unlinkedKdiAlerts,
  companyNumbers, fiscalOf, MANDALA_HEADER, COMPANY,
} from "../lib/mandala.js";

test("達成率：以上は実績÷目標、以下は目標以下で100%", () => {
  assert.equal(achievement(90, 100, "以上"), 90);
  assert.equal(achievement(40, 42, "以下"), 100);
  assert.equal(achievement(50, 42, "以下"), 84);
  assert.equal(achievement(null, 100, "以上"), null);
  assert.equal(fiscalOf("2027-03").fiscalYear, 2026);
  assert.equal(fiscalOf("2026-07").fiscalYear, 2026);
});

test("マンダラ：初期値は9マス、シートに保存したマスで上書き", () => {
  assert.equal(defaultMandala("茨木").length, 9);
  assert.equal(defaultMandala(COMPANY)[0].metric, "company_sales");
  const m = parseMandala([MANDALA_HEADER, ["茨木", "2026", 0, "月商450万", "clinic_budget", 110, "%", "以上", "大皿", "", "", ""]]);
  const cells = mandalaFor(m, "茨木", "2026");
  assert.equal(cells[0].title, "月商450万");
  assert.equal(cells[0].target, 110);
  assert.equal(mandalaFor(m, "津田", "2026")[0].title, "院の目標（KGI）");
  assert.throws(() => validateCell({ cell: 9, title: "x" }, "茨木"), /マス/);
  assert.equal(validateCell({ cell: 2, title: "人件費", metric: "clinic_labor", target: "42" }, "茨木").direction, "以下");
});

test("改善アラート：KDIは達成なのにKGI未達／マスにKDIが無い", () => {
  const cells = defaultMandala("茨木").map((c) => ({ ...c, target: c.cell === 0 ? 100 : c.target }));
  const kdiLinks = [
    { personKey: "a", name: "定井", kdi: { id: "k1", label: "通院計画の説明", target: 40, unit: "件", direction: "以上", mandala: "茨木#1" }, actual: 48 },
    { personKey: "a", name: "定井", kdi: { id: "k2", label: "口コミ", target: 10, unit: "件", direction: "以上", mandala: "" }, actual: 3 },
  ];
  const runs = parseRuns([["対象"], ["茨木", "2026", "1", "2026-09", "取組中", "チラシ"]]);
  const ch = buildChart({ scope: "茨木", fy: "2026", cells, runs, values: { clinic_budget: 90.8, clinic_new_count: 30 }, monthKey: "2026-09", kdiLinks });
  assert.equal(ch.cells[0].achievement, 90.8);
  assert.equal(ch.cells[1].kdiRate, 120);
  assert.equal(ch.cells[1].status, "取組中");
  const mismatch = ch.alerts.filter((a) => a.type === "mismatch");
  assert.equal(mismatch.length, 1);
  assert.equal(mismatch[0].cell, 1);
  assert.equal(ch.alerts.filter((a) => a.type === "unlinked").length, 7); // KDIの無いマス（2〜8）
  // KGIが達成なら「かみ合っていない」は出ない
  const ok = buildChart({ scope: "茨木", fy: "2026", cells, runs, values: { clinic_budget: 105, clinic_new_count: 30 }, monthKey: "2026-09", kdiLinks });
  assert.equal(ok.alerts.filter((a) => a.type === "mismatch").length, 0);
  // 紐づいていないKDIは人ごとにまとめる
  const un = unlinkedKdiAlerts(kdiLinks);
  assert.equal(un.length, 1);
  assert.match(un[0].text, /1件（口コミ）/);
});

test("会社の数字：売上・人件費は台帳から", () => {
  const model = { fiscalYear: 2026, clinics: [{ months: [{ month: 9, actual: 1000000, budget: 1000000 }] }], company: [{ months: [{ month: 9, sales: 20000000, labor: 10000000 }] }] };
  const n = companyNumbers(model, "2026-09");
  assert.equal(n.values.company_labor, 50);
  assert.equal(n.values.company_sales, 20000000);
  assert.equal(companyNumbers(model, "2026-10").sales, null);
});
