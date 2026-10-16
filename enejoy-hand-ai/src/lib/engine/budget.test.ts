import { describe, expect, it } from "vitest";
import { getLimits } from "@/config/limits";
import { MemoryStore } from "@/lib/store/store";
import { buildSnapshot } from "@/lib/view";
import { budgetTable, openClinicMonths } from "./budget-metrics";
import { discardBudgetDraft, editBudgetDraft, fillBudgetStandard, requestBudgetConfirm } from "./budget";
import { DemoExecutor } from "./demo-executor";
import { decideApproval, EngineError, importDailyReport, resetDemoData, type EngineDeps } from "./engine";
import { executeApprovedAction } from "./reputation";

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

describe("院別の売上予算", () => {
  it("未確定なら1院あたり月350万円で計算し、開院前の月は0円。3億円との差と必要な院平均を出す", async () => {
    const { deps } = setup();
    const t = budgetTable(await deps.store.read(), deps.now());
    // 7院×12か月のうち、香里園院（10月開院）は7〜9月が対象外 → 81枠
    expect(openClinicMonths()).toBe(81);
    expect(t.clinicMonthSlots).toBe(81);
    expect(t.totalBudget).toBe(81 * 3_500_000);
    expect(t.gapToTarget).toBe(300_000_000 - 283_500_000);
    expect(t.requiredAverageForTarget).toBe(3_710_000); // 3億 ÷ 81 ≒ 370.4万 → 万円単位で切り上げ
    const korien = t.rows.find((r) => r.clinicId === "korien")!;
    expect(korien.cells.find((c) => c.month === "2026-09")?.budget).toBe(0);
    expect(korien.totalBudget).toBe(9 * 3_500_000);
    expect(t.confirmed).toBeNull();
  });

  it("実績・着地予想と比べて達成率を出す（過ぎた月は実績、今月は着地予想）", async () => {
    const { deps } = setup();
    const head = ["院名", "目標売上", "累計実績", "着地予想", "新患数"];
    await importDailyReport(deps, OPERATOR, { month: "2026-09", grid: [head, ["本院", "", "¥3,850,000", "", "10"]], source: "csv" });
    await importDailyReport(deps, OPERATOR, { month: "2026-10", grid: [head, ["本院", "", "¥1,500,000", "¥3,150,000", "5"]], source: "csv" });
    const t = budgetTable(await deps.store.read(), deps.now());
    const honin = t.rows.find((r) => r.clinicId === "honin")!;
    expect(honin.cells.find((c) => c.month === "2026-09")?.rate).toBe(110);
    expect(honin.cells.find((c) => c.month === "2026-10")?.rate).toBe(90);
    expect(honin.cells.find((c) => c.month === "2026-11")?.rate).toBeNull();
    // 数字のない院・月（7・8月など）は、ここまでの達成見込みに含めない
    expect(honin.budgetToDate).toBe(7_000_000);
    expect(honin.landingToDate).toBe(3_850_000 + 3_150_000);
    expect(t.rateToDate).toBe(100);
  });

  it("案を編集して承認依頼し、承認されたらその内容で確定する。承認待ちの間は編集できない", async () => {
    const { deps } = setup();
    await editBudgetDraft(deps, OPERATOR, { cells: [{ month: "2026-11", clinicId: "honin", amountJpy: 4_000_000 }] });
    await expect(editBudgetDraft(deps, OPERATOR, { cells: [{ month: "2026-08", clinicId: "korien", amountJpy: 1 }] })).rejects.toBeInstanceOf(EngineError);
    let d = await deps.store.read();
    expect(budgetTable(d, deps.now(), "draft").totalBudget).toBe(283_500_000 + 500_000);
    // 確定前は、確定予算（基準額）の表示は変わらない
    expect(budgetTable(d, deps.now()).totalBudget).toBe(283_500_000);

    const a = await requestBudgetConfirm(deps, OPERATOR, "本院は11月の繁忙期に上乗せ");
    expect(a).toMatchObject({ category: "budget_change", mode: "live", recommendedApprover: "president", presidentRequired: false });
    expect(a.action).toContain("3億円まで");
    expect(a.action).toContain("本院は11月の繁忙期に上乗せ");
    await expect(editBudgetDraft(deps, OPERATOR, { cells: [] })).rejects.toBeInstanceOf(EngineError);
    await expect(fillBudgetStandard(deps, OPERATOR, 3_700_000)).rejects.toBeInstanceOf(EngineError);
    d = await deps.store.read();
    expect(buildSnapshot(d, "demo", deps.now(), deps.limits).budget.pendingApprovalId).toBe(a.id);

    await decideApproval(deps, a.id, OPERATOR, "ESCALATE");
    await decideApproval(deps, a.id, PRESIDENT, "APPROVED");
    expect((await executeApprovedAction(deps, a.id, null))?.status).toBe("done");
    d = await deps.store.read();
    expect(d.budget.draft).toBeNull();
    expect(d.budget.confirmed?.approvalId).toBe(a.id);
    const t = budgetTable(d, deps.now());
    expect(t.totalBudget).toBe(284_000_000);
    expect(t.confirmed?.approvalId).toBe(a.id);
    expect(d.audit.some((x) => x.action === "budget.confirm")).toBe(true);

    // 予算は本番の記録なので、デモの初期化では消えない
    await resetDemoData(deps);
    expect((await deps.store.read()).budget.confirmed).not.toBeNull();
  });

  it("基準額で全部埋める・案の破棄・却下後は再び編集できる", async () => {
    const { deps } = setup();
    await fillBudgetStandard(deps, OPERATOR, 3_710_000);
    let d = await deps.store.read();
    expect(budgetTable(d, deps.now(), "draft").gapToTarget).toBeLessThanOrEqual(0);
    const a = await requestBudgetConfirm(deps, OPERATOR);
    await decideApproval(deps, a.id, OPERATOR, "REJECTED", "現場と相談してから");
    await editBudgetDraft(deps, OPERATOR, { cells: [{ month: "2026-12", clinicId: "tsuda", amountJpy: 3_000_000 }] });
    await discardBudgetDraft(deps, OPERATOR);
    d = await deps.store.read();
    expect(d.budget.draft).toBeNull();
    expect(d.budget.confirmed).toBeNull();
  });
});
