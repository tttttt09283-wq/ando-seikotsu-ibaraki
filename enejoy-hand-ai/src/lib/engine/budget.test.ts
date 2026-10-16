import { describe, expect, it } from "vitest";
import { getLimits } from "@/config/limits";
import { MemoryStore } from "@/lib/store/store";
import { buildSnapshot } from "@/lib/view";
import { getClinics } from "@/lib/clinics";
import { parseBudgetGrid } from "@/lib/import/budget";
import { TENANT } from "@/tenant";
import { budgetTable, fiscalMonths, openClinicMonths } from "./budget-metrics";
import { applyStaffing, discardBudgetDraft, editBudgetDraft, fillBudgetStandard, importBudget, requestBudgetConfirm } from "./budget";
import { addClinic, removeClinic, updateClinic } from "./clinics-admin";
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
    expect(openClinicMonths(TENANT.clinics)).toBe(81);
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

  it("人員を入れて「人数 × 1人あたり」で金額を計算する。人員を空にすると人員なしに戻る", async () => {
    const { deps } = setup();
    await editBudgetDraft(deps, OPERATOR, {
      perStaffJpy: 1_200_000,
      cells: [
        { month: "2026-11", clinicId: "honin", staff: 3.5 },
        { month: "2026-12", clinicId: "honin", staff: 4 },
      ],
    });
    // 人員だけ入れた段階では金額は変わらない
    let t = budgetTable(await deps.store.read(), deps.now(), "draft");
    expect(t.rows.find((r) => r.clinicId === "honin")!.cells.find((c) => c.month === "2026-11")).toMatchObject({ budget: 3_500_000, staff: 3.5 });
    expect(await applyStaffing(deps, OPERATOR, {})).toEqual({ changed: 2 });
    t = budgetTable(await deps.store.read(), deps.now(), "draft");
    const honin = t.rows.find((r) => r.clinicId === "honin")!;
    expect(honin.cells.find((c) => c.month === "2026-11")).toMatchObject({ budget: 4_200_000, perStaff: 1_200_000 });
    expect(honin.cells.find((c) => c.month === "2026-12")?.budget).toBe(4_800_000);
    expect(t.monthTotals.find((m) => m.month === "2026-12")?.staff).toBe(4);
    expect(t.perStaffJpy).toBe(1_200_000);

    await editBudgetDraft(deps, OPERATOR, { cells: [{ month: "2026-12", clinicId: "honin", staff: null }] });
    t = budgetTable(await deps.store.read(), deps.now(), "draft");
    expect(t.rows.find((r) => r.clinicId === "honin")!.cells.find((c) => c.month === "2026-12")).toMatchObject({ budget: 4_800_000, staff: null });
  });

  it("予算表（月の列の表）を取り込み、単位を自動で判断する。院が分からない行は知らせる", () => {
    const grid = [
      ["院名", "7月", "8月", "9月", "10月", "11月", "12月"],
      ["本院", "4,000", "4,000", "4,000", "4,200", "4,200", "4,500"],
      ["津田院", "3,000", "3,000", "3,000", "3,000", "3,000", "3,000"],
      ["吹田院", "1,000", "1,000", "1,000", "1,000", "1,000", "1,000"],
      ["合計", "8,000", "8,000", "8,000", "8,200", "8,200", "8,500"],
    ];
    const r = parseBudgetGrid(grid, { clinics: TENANT.clinics, fromMonth: TENANT.revenueTarget.fromMonth, months: fiscalMonths(), unit: "auto" });
    expect(r.unitUsed).toBe("thousand");
    expect(r.annualOnly).toBe(false);
    expect(r.cells).toContainEqual({ month: "2026-12", clinicId: "honin", amountJpy: 4_500_000 });
    expect(r.cells.filter((c) => c.clinicId === "tsuda")).toHaveLength(6);
    expect(r.unmatched).toEqual(["吹田院"]);
  });

  it("年間予算だけの表は、営業している月に均等に割り振る（開院前の月には入れない）", async () => {
    const { deps } = setup();
    const res = await importBudget(deps, OPERATOR, {
      grid: [
        ["院", "年間予算（万円）"],
        ["本院", "4,800"],
        ["香里園院", "3,000"],
      ],
      unit: "auto",
    });
    expect(res).toMatchObject({ annualOnly: true, unit: "万円", cells: 12 + 9 });
    const t = budgetTable(await deps.store.read(), deps.now(), "draft");
    const honin = t.rows.find((r) => r.clinicId === "honin")!;
    expect(honin.totalBudget).toBe(48_000_000);
    expect(honin.cells.every((c) => c.budget === 4_000_000)).toBe(true);
    const korien = t.rows.find((r) => r.clinicId === "korien")!;
    expect(korien.totalBudget).toBe(30_000_000);
    expect(korien.cells.find((c) => c.month === "2026-09")?.budget).toBe(0);
    // 表にない院は今の案（基準額）のまま
    expect(t.rows.find((r) => r.clinicId === "tsuda")!.totalBudget).toBe(12 * 3_500_000);
    await expect(importBudget(deps, OPERATOR, { grid: [["メモ"], ["なし"]], unit: "auto" })).rejects.toBeInstanceOf(EngineError);
  });

  it("確定するたびに版が増え（当初予算 → 修正予算①）、当初予算との差が分かる", async () => {
    const { deps } = setup();
    const confirm = async (note?: string) => {
      const a = await requestBudgetConfirm(deps, OPERATOR, note);
      await decideApproval(deps, a.id, OPERATOR, "APPROVED");
      await executeApprovedAction(deps, a.id, null);
    };
    await confirm();
    await editBudgetDraft(deps, OPERATOR, { cells: [{ month: "2027-01", clinicId: "honin", amountJpy: 5_000_000 }] });
    await confirm("本院に施術者が1名増える");
    const d = await deps.store.read();
    expect(d.budget.history.map((v) => v.label)).toEqual(["当初予算", "修正予算①"]);
    expect(d.budget.history[1].note).toBe("本院に施術者が1名増える");
    const t = budgetTable(d, deps.now());
    expect(t.confirmed?.label).toBe("修正予算①");
    expect(t.originalTotal).toBe(283_500_000);
    expect(t.totalBudget).toBe(283_500_000 + 1_500_000);
    expect(t.rows.find((r) => r.clinicId === "honin")!.diffFromOriginal).toBe(1_500_000);
    const snap = buildSnapshot(d, "demo", deps.now(), deps.limits);
    expect(snap.budget.original?.totalBudget).toBe(283_500_000);
  });

  it("新しい院を追加すると開院月から基準額が入り、最終営業月の翌月からは0円。使っていない追加院は削除できる", async () => {
    const { deps } = setup();
    const c = await addClinic(deps, OPERATOR, { name: "吹田院", openedMonth: "2027-04", tags: ["巻き爪"] });
    let d = await deps.store.read();
    expect(getClinics(d).map((x) => x.id)).toContain(c.id);
    let t = budgetTable(d, deps.now());
    const suita = t.rows.find((r) => r.clinicId === c.id)!;
    expect(suita.added).toBe(true);
    expect(suita.cells.find((x) => x.month === "2027-03")?.budget).toBe(0);
    expect(suita.totalBudget).toBe(3 * 3_500_000);
    expect(t.clinicMonthSlots).toBe(84);
    // 同じ名前は追加できない
    await expect(addClinic(deps, OPERATOR, { name: "吹田院" })).rejects.toBeInstanceOf(EngineError);

    // 既存の院を3月末で閉院（3月が最終営業月 → 4月から0円）
    await updateClinic(deps, OPERATOR, { id: "tsuda", closedMonth: "2027-03" });
    t = budgetTable(await deps.store.read(), deps.now());
    const tsuda = t.rows.find((r) => r.clinicId === "tsuda")!;
    expect(tsuda.cells.find((x) => x.month === "2027-03")?.budget).toBe(3_500_000);
    expect(tsuda.cells.find((x) => x.month === "2027-04")?.budget).toBe(0);
    expect(tsuda.totalBudget).toBe(9 * 3_500_000);
    await expect(updateClinic(deps, OPERATOR, { id: "tsuda", openedMonth: "2027-05" })).rejects.toBeInstanceOf(EngineError);
    await updateClinic(deps, OPERATOR, { id: "tsuda", closedMonth: null });
    expect(budgetTable(await deps.store.read(), deps.now()).rows.find((r) => r.clinicId === "tsuda")!.totalBudget).toBe(12 * 3_500_000);

    // 既存の院は削除できない。追加した院は削除できる
    await expect(removeClinic(deps, OPERATOR, "tsuda")).rejects.toBeInstanceOf(EngineError);
    await removeClinic(deps, OPERATOR, c.id);
    d = await deps.store.read();
    expect(getClinics(d).some((x) => x.id === c.id)).toBe(false);
  });
});
