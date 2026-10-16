import { describe, expect, it } from "vitest";
import { getLimits } from "@/config/limits";
import { getClinics } from "@/lib/clinics";
import { parseOrgChart } from "@/lib/import/org-chart";
import { parseClinicYearGrid, parsePeriodStart } from "@/lib/import/year-grid";
import { MemoryStore } from "@/lib/store/store";
import { buildSnapshot } from "@/lib/view";
import { TENANT } from "@/tenant";
import { budgetTable } from "./budget-metrics";
import { DemoExecutor } from "./demo-executor";
import { decideApproval, EngineError, importDailyReport, type EngineDeps } from "./engine";
import { kpiTable } from "./kpi-metrics";
import { midPlanTable } from "./midplan-metrics";
import {
  applyOrgToBudget,
  createScenario,
  importOrgChart,
  importPlanSheet,
  recordKpiValue,
  removeKpi,
  requestPlanAdopt,
  saveKpi,
  updateScenario,
} from "./planning";
import { executeApprovedAction } from "./reputation";

// テストの数字・名前はすべて架空（実際のシートと同じ形だけをまねている）

const OPERATOR = "iwanaga";
const PRESIDENT = "murakami";

function setup() {
  const deps: EngineDeps = {
    store: new MemoryStore(),
    executor: new DemoExecutor(),
    limits: getLimits(),
    timing: { analyzeMs: 1, thinkMs: 1, workMs: 1, reviewMs: 1, reportMs: 1 },
    now: () => new Date("2026-10-16T03:00:00Z"),
    costOf: () => 0,
  };
  return { deps };
}

const MONTHS = ["7月", "8月", "9月", "10月", "11月", "12月", "1月", "2月", "3月", "4月", "5月", "6月"];
const twelve = (v: number | string) => Array.from({ length: 12 }, () => (typeof v === "number" ? v.toLocaleString("en-US") : v));
const sum12 = (v: number) => (v * 12).toLocaleString("en-US");

/** 年間予算表（R8.7~R9.6 形式）の架空の例 */
function annualSheet() {
  return [
    ["", "", "", "", "", ""],
    ["", "年間予算", "100,000,000", "", "", "", "", "店舗予算", "90,000,000"],
    ["", "昨年売上", "80,000,000"],
    ["", "", "", "", ...MONTHS],
    ["", "", "R8.7~R9.6", "100,500,000", ...twelve(0)],
    ["", "", "R7.7~R8.6", "74,400,000", ...twelve(0)],
    ["", "", "", "", ...twelve("105.0%")],
    ["", "本院", "R8.7~R9.6", sum12(3_500_000), ...twelve(3_500_000)],
    ["", "", "R7.7~R8.6", sum12(3_000_000), ...twelve(3_000_000)],
    ["", "", "6,000,000", "", ...twelve("116.7%"), "116.7%"],
    ["", "", "", "4.4", "4", "4", "4", "4", "5", "5", "5", "4.5", "4.5", "4", "4", "4"],
    ["", "田口山", "R8.7~R9.6　理想値", sum12(3_600_000), ...twelve(3_600_000)],
    ["", "", "現実", sum12(3_400_000), ...twelve(3_400_000)],
    ["", "", "R7.7~R8.6", sum12(3_200_000), ...twelve(3_200_000)],
    ["", "", "", "", ...twelve("112.5%")],
    ["", "香里園", "R8.7~R9.6", "28,500,000", "", "", "", "1,500,000", "2,000,000", "2,500,000", "3,000,000", "3,500,000", "3,500,000", "3,500,000", "3,500,000", "3,500,000"],
    ["", "吹田", "R8.7~R9.6", sum12(1_000_000), ...twelve(1_000_000)],
  ];
}

/** 来期の新案（成長率つき） */
function nextYearSheet() {
  return [
    ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "既存店成長率", "1.05"],
    ["", "", "", "", ...MONTHS],
    ["", "本院", "R9.7~R10.6", sum12(3_675_000), ...twelve(3_675_000)],
    ["", "", "R8.7~R9.6", sum12(3_500_000), ...twelve(3_500_000)],
    ["", "", "", "", ...twelve("105.0%")],
  ];
}

/** 進捗売上実績の「院」タブの架空の例（合計の列が途中にある） */
function progressSheet() {
  const head = ["拠点", "項目", "7月", "8月", "9月", "10月", "11月", "12月", "合計", "１月", "２月", "3月", "4月", "5月", "6月", "合計", "総合計"];
  const budgetRow = ["本院", "予算", ...Array.from({ length: 6 }, () => "¥3,500,000"), "¥21,000,000", ...Array.from({ length: 6 }, () => "¥3,500,000"), "¥21,000,000", "¥42,000,000"];
  return [
    ["", "", "累計予算", "", "", "23.13%"],
    head,
    budgetRow,
    ["", "実績", "¥3,850,000", "¥3,700,000", "¥3,600,000", "¥1,200,000", "", "", "¥12,350,000", "", "", "", "", "", "", "¥0", "¥12,350,000"],
    ["", "達成率", "110.0%", "105.7%", "102.9%", "0.0%", "0.0%", "0.0%", "53.7%"],
    ["", "昨対", "3000000", "3000000", "3000000", "3000000", "3000000", "3000000"],
    ["", "昨対比", "", "", ""],
  ];
}

/** 組織図の架空の例（名前は記号。スタッフの名前は保存しない） */
function orgSheet() {
  return [
    ["", "", "", "", "", "", ""],
    ["", "院名", "茨木院", "大和田院", "香里園", "本院", "新店舗", "", "", "新卒予定", "免許"],
    ["", "院長", "A", "B", "C", "D", "？", "", "", "X", "柔整"],
    ["", "副院長", "", "", "", "", ""],
    ["", "施術者", "E", "F", "G", "H", "中途"],
    ["", "施術者", "I（中途）", "", "", "", ""],
    ["", "時短施術者", "J", "", "K", "", ""],
    ["", "施術者（ア）", "", "L", "", "M", ""],
    ["", "受付", "", "", "", "N", ""],
    ["", "受付（ア/パ）", "", "", "", "O", ""],
    ["", "ブロックマネージャー", "北", "", "", "南", ""],
    ["", "ゼネラルマネージャー", "北", "", "", "", ""],
    ["", "", "", "", "", "", ""],
    ["", "院長", "1", "1", "1", "1", "1"],
  ];
}

describe("年間予算表・進捗表の読み取り", () => {
  it("年度の表記を期首の年月にする", () => {
    expect(parsePeriodStart("R8.7~R9.6")).toBe("2026-07");
    expect(parsePeriodStart("R9.7〜R10.6")).toBe("2027-07");
    expect(parsePeriodStart("令和8年7月〜令和9年6月")).toBe("2026-07");
    expect(parsePeriodStart("2026.7~2027.6")).toBe("2026-07");
    expect(parsePeriodStart("現実")).toBeNull();
  });

  it("R8.7~R9.6 形式：今期の予算・人員・前年の実績を院ごとに読み、% の行と全体の行は読まない", () => {
    const r = parseClinicYearGrid(annualSheet(), { clinics: TENANT.clinics, currentFyStart: "2026-07" });
    expect(r.recognized).toBe(true);
    expect(r.unitUsed).toBe("yen");
    const fy = r.budgets.find((b) => b.fyStart === "2026-07")!;
    expect(fy.cells.filter((c) => c.clinicId === "honin")).toHaveLength(12);
    expect(fy.cells).toContainEqual({ month: "2027-06", clinicId: "honin", amountJpy: 3_500_000 });
    // 理想値と現実の2行 → 上の行（理想値）を使い、知らせる
    expect(fy.cells.find((c) => c.clinicId === "taguchiyama")?.amountJpy).toBe(3_600_000);
    expect(r.warnings.some((w) => w.includes("2行"))).toBe(true);
    // 開院前の月（香里園の7〜9月）は入れない
    expect(fy.cells.filter((c) => c.clinicId === "korien").map((c) => c.month)[0]).toBe("2026-10");
    // 人員の行
    expect(fy.staff.filter((s) => s.clinicId === "honin")).toHaveLength(12);
    expect(fy.staff.find((s) => s.clinicId === "honin" && s.month === "2027-02")?.staff).toBe(4.5);
    // 前年度の実績
    expect(r.actuals).toContainEqual({ month: "2025-07", clinicId: "honin", amountJpy: 3_000_000 });
    expect(r.actuals.filter((a) => a.clinicId === "taguchiyama")).toHaveLength(12);
    expect(r.unmatched).toEqual(["吹田"]);
    expect(fy.companyTotal).toBe(100_500_000);
  });

  it("進捗表の「院」タブ：予算・実績・昨対（前年度の実績）を読み、合計の列は飛ばす", () => {
    const r = parseClinicYearGrid(progressSheet(), { clinics: TENANT.clinics, currentFyStart: "2026-07" });
    const fy = r.budgets.find((b) => b.fyStart === "2026-07")!;
    expect(fy.cells.filter((c) => c.clinicId === "honin")).toHaveLength(12);
    expect(fy.cells.find((c) => c.month === "2027-01")?.amountJpy).toBe(3_500_000);
    expect(r.actuals).toContainEqual({ month: "2026-09", clinicId: "honin", amountJpy: 3_600_000 });
    expect(r.actuals).toContainEqual({ month: "2025-12", clinicId: "honin", amountJpy: 3_000_000 });
  });

  it("組織図：院ごとの役割別の人数と施術者の換算人数（時短・アルバイトは0.5、受付は0）、ブロック", () => {
    const r = parseOrgChart(orgSheet(), { clinics: TENANT.clinics, roles: TENANT.staffRoles });
    const by = Object.fromEntries(r.clinics.map((c) => [c.clinicId, c]));
    expect(by.ibaraki.counts).toEqual({ director: 1, therapist: 2, short: 1 });
    expect(by.ibaraki.fte).toBe(3.5);
    expect(by.owada.fte).toBe(2.5);
    expect(by.honin.counts).toMatchObject({ reception: 1, receptionPart: 1 });
    expect(by.honin.fte).toBe(2.5);
    expect(r.unmatched).toEqual([{ label: "新店舗", counts: { director: 1, therapist: 1 }, fte: 2 }]);
    // 結合セルのブロックは右へ引き継ぐ
    expect(r.blocks).toEqual({ ibaraki: "北", owada: "北", korien: "北", honin: "南" });
    // 名前は結果に含まれない
    expect(JSON.stringify(r)).not.toMatch(/"A"|"E"|中途/);
  });
});

describe("取り込み・人員・管理項目・中期計画", () => {
  it("年間予算表を取り込むと、今期は予算の案（人員つき）、前年は実績、来期の新案は中期計画に入る", async () => {
    const { deps } = setup();
    const r = (await importPlanSheet(deps, OPERATOR, { grid: annualSheet(), unit: "auto", source: "csv", label: "年間予算.csv" }))!;
    expect(r.kind).toBe("year_grid");
    expect(r.budget.cells).toBe(12 + 12 + 9);
    expect(r.actuals).toMatchObject({ cells: 24, previousYear: 24 });
    let d = await deps.store.read();
    const draft = budgetTable(d, deps.now(), "draft");
    expect(draft.rows.find((x) => x.clinicId === "honin")!.cells.find((c) => c.month === "2026-11")).toMatchObject({ budget: 3_500_000, staff: 5 });
    expect(d.clinicMonths.find((x) => x.month === "2025-08" && x.clinicId === "honin")?.values.salesActual).toBe(3_000_000);

    const r2 = (await importPlanSheet(deps, OPERATOR, { grid: nextYearSheet(), unit: "auto", source: "csv" }))!;
    expect(r2.futureYears).toEqual([{ fyStart: "2027-07", term: "第11期", clinics: 1, total: 12 * 3_675_000 }]);
    expect(r2.scenarioName).toBe("標準");
    // 新案の表にある今期の行は比較用なので、予算の案には入れない
    expect(r2.budget.cells).toBe(0);
    d = await deps.store.read();
    const s = d.midPlan.scenarios[0];
    const y = s.years.find((x) => x.fyStart === "2027-07")!;
    expect(y.growthRate).toBe(1.05);
    expect(y.monthly.honin).toHaveLength(12);

    // 表の形でなければ null（呼び出し側で別の読み方をする）
    expect(await importPlanSheet(deps, OPERATOR, { grid: [["院名", "年間予算"], ["本院", "4800"]], unit: "auto", source: "csv" })).toBeNull();
  });

  it("組織図を取り込むとブロックが院の設定に入り、人員を予算の案に反映できる", async () => {
    const { deps } = setup();
    const res = await importOrgChart(deps, OPERATOR, { grid: orgSheet(), month: "2026-10", kind: "actual", label: "2026.10" });
    expect(res).toMatchObject({ clinics: 4, fte: 11, unmatched: ["新店舗"], blocksChanged: 4 });
    let d = await deps.store.read();
    expect(getClinics(d).find((c) => c.id === "ibaraki")?.block).toBe("北");
    expect(JSON.stringify(d.org)).not.toMatch(/"A"|"H"/);
    const applied = await applyOrgToBudget(deps, OPERATOR, res.snapshotId);
    expect(applied).toMatchObject({ from: "2026-10", to: "2027-06" });
    d = await deps.store.read();
    const draft = budgetTable(d, deps.now(), "draft");
    expect(draft.rows.find((x) => x.clinicId === "ibaraki")!.cells.find((c) => c.month === "2026-12")?.staff).toBe(3.5);
    expect(draft.rows.find((x) => x.clinicId === "ibaraki")!.cells.find((c) => c.month === "2026-09")?.staff).toBeNull();
  });

  it("管理項目：売上・予算達成率・昨対比・1人あたり売上を院・ブロック・全院で計算する", async () => {
    const { deps } = setup();
    await importPlanSheet(deps, OPERATOR, { grid: progressSheet(), unit: "auto", source: "csv" });
    await importOrgChart(deps, OPERATOR, { grid: orgSheet(), month: "2026-07", kind: "actual", label: "2026.7" });
    const t = kpiTable(await deps.store.read(), deps.now());
    expect(t.defaultMonth).toBe("2026-09");
    const sep = (id: string) => t.cells[id]["2026-09"];
    expect(sep("sales").honin).toEqual({ v: 3_600_000, t: 3_500_000, a: 102.9 });
    expect(sep("budgetRate").honin.v).toBe(102.9);
    expect(sep("yoy").honin.v).toBe(120);
    expect(sep("perStaff").honin.v).toBe(1_440_000);
    expect(sep("staff").honin.v).toBe(2.5);
    // ブロック（南＝本院だけ）と全院
    expect(t.columns.map((c) => c.id)).toEqual(expect.arrayContaining(["block:北", "block:南", "all"]));
    expect(sep("sales")["block:南"].v).toBe(3_600_000);
    // 全院：9月はまだ香里園が開院前なので、香里園の人数は入らない
    expect(sep("staff").all.v).toBe(8.5);
    // キャンセル率は低いほど良い
    expect(t.defs.find((d) => d.id === "cancelRate")?.direction).toBe("down");
  });

  it("管理項目を追加・手入力・外す", async () => {
    const { deps } = setup();
    const def = await saveKpi(deps, OPERATOR, {
      name: "回数券の販売数",
      unit: "count",
      calc: { kind: "manual" },
      direction: "up",
      target: { kind: "value", value: 10 },
    });
    await recordKpiValue(deps, OPERATOR, { kpiId: def.id, month: "2026-09", clinicId: "honin", value: 12 });
    await recordKpiValue(deps, OPERATOR, { kpiId: def.id, month: "2026-09", clinicId: "tsuda", value: 6 });
    let t = kpiTable(await deps.store.read(), deps.now());
    expect(t.cells[def.id]["2026-09"].honin).toEqual({ v: 12, t: 10, a: 120 });
    // 全院は合計、目標は院の数だけ
    expect(t.cells[def.id]["2026-09"].all.v).toBe(18);

    const ratio = await saveKpi(deps, OPERATOR, {
      name: "新患比率",
      unit: "percent",
      calc: { kind: "ratio", numerator: "newPatients", denominator: "totalVisits" },
      direction: "up",
    });
    await expect(saveKpi(deps, OPERATOR, { name: "x", unit: "count", calc: { kind: "series", key: "nope" }, direction: "up" })).rejects.toBeInstanceOf(EngineError);
    await expect(recordKpiValue(deps, OPERATOR, { kpiId: "sales", month: "2026-09", clinicId: "honin", value: 1 })).rejects.toBeInstanceOf(EngineError);
    await removeKpi(deps, OPERATOR, ratio.id);
    await removeKpi(deps, OPERATOR, "unitPrice");
    t = kpiTable(await deps.store.read(), deps.now());
    expect(t.defs.map((d) => d.id)).not.toContain(ratio.id);
    expect(t.defs.map((d) => d.id)).not.toContain("unitPrice");
  });

  it("中期計画：既存店は成長率で伸び、新店は立ち上がり、取り込んだ計画は優先。採用は承認制", async () => {
    const { deps } = setup();
    const s = await createScenario(deps, OPERATOR, { name: "標準" });
    expect(s.years.map((y) => y.fyStart)).toEqual(["2027-07", "2028-07", "2029-07"]);
    let t = midPlanTable(await deps.store.read(), deps.now(), s);
    expect(t.years.map((y) => y.term)).toEqual(["第10期", "第11期", "第12期", "第13期"]);
    expect(t.years[0].era).toBe("R8.7〜R9.6");
    // 今期は基準額（実績なし）＝2億8,350万円、来期は ×1.05（香里園の7〜9月は直近3か月の平均から）
    expect(t.years[0].revenue).toBe(283_500_000);
    const honin1 = t.years[1].rows.find((r) => r.id === "honin")!;
    expect(honin1.annual).toBe(12 * Math.round(3_500_000 * 1.05));
    expect(t.years[1].rows.find((r) => r.id === "korien")!.monthly[0]).toBe(Math.round(3_500_000 * 1.05));
    expect(t.years[1].yoy).toBeGreaterThan(105);

    await updateScenario(deps, OPERATOR, {
      id: s.id,
      laborPerStaffYearJpy: 4_000_000,
      otherCostRate: 30,
      years: [{ fyStart: "2027-07", growthRate: 1.1, clinicGrowth: { tsuda: 1.0 }, staff: { honin: 4, tsuda: 3 }, targetJpy: 350_000_000 }],
      newStores: [{ name: "8店舗目", openMonth: "2027-10", startJpy: 1_500_000, matureJpy: 3_500_000, rampMonths: 4, staff: 3 }],
    });
    let d = await deps.store.read();
    t = midPlanTable(d, deps.now(), d.midPlan.scenarios[0]);
    const y1 = t.years[1];
    expect(y1.rows.find((r) => r.id === "honin")!.annual).toBe(12 * Math.round(3_500_000 * 1.1));
    expect(y1.rows.find((r) => r.id === "tsuda")!.annual).toBe(12 * 3_500_000);
    const store = y1.rows.find((r) => r.name === "8店舗目")!;
    expect(store.monthly.slice(0, 6)).toEqual([0, 0, 0, 1_500_000, 2_000_000, 2_500_000]);
    expect(store.monthly[11]).toBe(3_500_000);
    expect(y1.newRevenue).toBe(store.annual);
    expect(y1.clinicsOpen).toBe(8);
    expect(y1.targetJpy).toBe(350_000_000);
    expect(y1.profitJpy).not.toBeNull();
    // 人員は「人数 × 営業月数」で按分：本院4人・津田3人・新店3人×9か月
    expect(y1.staffAvg).toBe(9.3);

    // 採用の承認依頼 → 代表が承認 → 採用（承認時点の内容）
    const a = await requestPlanAdopt(deps, OPERATOR, { id: s.id, note: "8店舗目は2027年秋" });
    expect(a).toMatchObject({ category: "budget_change", recommendedApprover: "president" });
    expect(a.action).toContain("第11期");
    await expect(requestPlanAdopt(deps, OPERATOR, { id: s.id })).rejects.toBeInstanceOf(EngineError);
    await updateScenario(deps, OPERATOR, { id: s.id, years: [{ fyStart: "2027-07", growthRate: 1.2 }] });
    await decideApproval(deps, a.id, OPERATOR, "ESCALATE");
    await decideApproval(deps, a.id, PRESIDENT, "APPROVED");
    expect((await executeApprovedAction(deps, a.id, null))?.status).toBe("done");
    d = await deps.store.read();
    expect(d.midPlan.adopted?.approvalId).toBe(a.id);
    expect(d.midPlan.adopted?.scenario.years[0].growthRate).toBe(1.1);
    expect(buildSnapshot(d, "demo", deps.now(), deps.limits).plan.adopted?.years[1].revenue).toBe(y1.revenue);
  });

  it("前年の実績があれば、今期の見込みの前年比を出す", async () => {
    const { deps } = setup();
    await importPlanSheet(deps, OPERATOR, { grid: annualSheet(), unit: "auto", source: "csv" });
    const head = ["院名", "目標売上", "累計実績", "着地予想", "新患数"];
    await importDailyReport(deps, OPERATOR, { month: "2026-09", grid: [head, ["本院", "", "¥3,900,000", "", "10"]], source: "csv" });
    const t = midPlanTable(await deps.store.read(), deps.now(), null);
    expect(t.previous).toMatchObject({ term: "第9期", era: "R7.7〜R8.6", months: 12 });
    expect(t.years[0].yoy).not.toBeNull();
    expect(t.years[0].rows.find((r) => r.id === "honin")!.monthly[2]).toBe(3_900_000);
  });
});
