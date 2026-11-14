import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildModel } from "../domain/model";
import { DEFAULT_ASSUMPTIONS, mergeAssumptions } from "../domain/assumptions";
import { parseCSV, toCSV } from "../io/csv";
import { actualsRows, parseActualsCsv } from "../io/export";
import { diffImport, exportGrid, exportList, guessMapping, looksLikeGrid, parseGrid, parseList } from "../io/mandala-io";
import { AuditedStore } from "./store/audited";
import { LocalStore } from "./store/local";
import { ensureInitialized } from "./seed";
import * as svc from "./services";
import { loadSnapshotForTest } from "./test-helpers";

const TODAY = "2026-11-15";
let dir: string;
let store: LocalStore;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "fos-"));
  store = new LocalStore("11111111-1111-4111-8111-111111111111", dir);
  await ensureInitialized(store, TODAY);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("初期化", () => {
  it("中心＋8領域・64行動・3シナリオ・7条件・マイルストーンを投入", async () => {
    const s = await loadSnapshotForTest(store);
    expect(s.goals).toHaveLength(9);
    expect(s.actions).toHaveLength(64);
    expect(s.scenarios.map((x) => x.kind).sort()).toEqual(["challenge", "conservative", "standard"]);
    expect(s.scenarios.filter((x) => x.is_primary)).toHaveLength(1);
    expect(s.criteria).toHaveLength(7);
    expect(s.milestones).toHaveLength(7);
    expect(s.goals.find((g) => g.code === "CENTER")?.title).toContain("1,200万円");
  });
  it("2回目以降は既存データを変更しない（重複投入もしない）", async () => {
    const goals = await store.list("mandala_goals");
    await store.update("mandala_goals", { id: goals.find((g) => g.code === "A")!.id }, { title: "自分で決めた領域名" });
    await store.remove("milestones", {});
    await ensureInitialized(store, TODAY);
    const s = await loadSnapshotForTest(store);
    expect(s.goals.find((g) => g.code === "A")?.title).toBe("自分で決めた領域名");
    expect(s.actions).toHaveLength(64);
    expect(s.milestones).toHaveLength(0); // 消したマイルストーンを勝手に戻さない
  });
});

describe("シナリオの保存と再読み込み", () => {
  it("前提値を保存すると、再読み込み後も同じ値で試算される", async () => {
    const sc = (await store.list("financial_scenarios")).find((x) => x.kind === "standard")!;
    await svc.saveAssumptions(store, sc.id, { clinic_price: 12000, ai_monthly_fee: 60000, not_a_key: 1 });
    const fresh = new LocalStore(store.userId, dir);
    const s = await loadSnapshotForTest(fresh);
    const a = mergeAssumptions("standard", s.assumptions.filter((x) => x.scenario_id === sc.id));
    expect(a.clinic_price).toBe(12000);
    expect(a.ai_monthly_fee).toBe(60000);
    expect(a.clinic_occupancy).toBe(DEFAULT_ASSUMPTIONS.standard.clinic_occupancy);
    expect(s.assumptions.some((x) => x.key === "not_a_key")).toBe(false);
    const m = buildModel(s, TODAY);
    expect(m.primary?.assumptions.clinic_price).toBe(12000);
  });
  it("数値でない値は保存しない", async () => {
    const sc = (await store.list("financial_scenarios"))[0];
    await expect(svc.saveAssumptions(store, sc.id, { clinic_price: "abc" })).rejects.toThrow();
  });
  it("主シナリオは常に1件", async () => {
    const scs = await store.list("financial_scenarios");
    const ch = scs.find((x) => x.kind === "challenge")!;
    await svc.setPrimaryScenario(store, ch.id);
    const after = await store.list("financial_scenarios");
    expect(after.filter((x) => x.is_primary).map((x) => x.id)).toEqual([ch.id]);
  });
});

describe("月次実績とKPIの連携", () => {
  const form = (month: string, clinic: string) => ({
    month,
    revenue: { clinic_treatment: clinic, clinic_other: "", ai_initial: "", ai_recurring: "100000", ai_product: "", ai_other: "" },
    expenses: { clinic_consumables: "20000" },
    clinic: { sessions: "40", new_patients: "5", active_patients: "25" },
    ai: { active_contracts: "2" },
    household: { living_cost: "350000", emergency_fund_balance: "2800000", note: "" },
  });
  it("保存した実績がマンダラの KPI・ダッシュボードに反映される", async () => {
    await svc.saveMonthlyActuals(store, form("2026-11-01", "400000"));
    const m = buildModel(await loadSnapshotForTest(store), TODAY);
    expect(m.current?.clinicRevenue).toBe(400000);
    expect(m.current?.profit).toBe(480000);
    const a8 = m.actionByCode.get("A8")!;
    expect(m.evals.get(a8.id)?.progress).toBe(50);
    const d3 = m.actionByCode.get("D3")!; // 生活防衛資金 6か月 → 8.0か月で達成
    expect(m.evals.get(d3.id)?.status).toBe("achieved");
  });
  it("空欄にすると行を消して「未入力」に戻す（0円とは区別）", async () => {
    await svc.saveMonthlyActuals(store, form("2026-11-01", "400000"));
    await svc.saveMonthlyActuals(store, form("2026-11-01", ""));
    const r = await store.list("business_revenue");
    expect(r.some((x) => x.business === "clinic" && x.category === "treatment")).toBe(false);
    await svc.saveMonthlyActuals(store, form("2026-11-01", "0"));
    expect((await store.list("business_revenue")).find((x) => x.category === "treatment")?.amount).toBe(0);
  });
  it("負の金額や月の形式違いは保存できない", async () => {
    await expect(svc.saveMonthlyActuals(store, form("2026-11-01", "-1"))).rejects.toThrow();
    await expect(svc.saveMonthlyActuals(store, form("2026-11-15", "1"))).rejects.toThrow();
  });
  it("月次実績 CSV の書き出し → 取り込みで同じ値になる", async () => {
    await svc.saveMonthlyActuals(store, form("2026-10-01", "300000"));
    const csv = toCSV(actualsRows(await loadSnapshotForTest(store)));
    const { months, errors } = parseActualsCsv(parseCSV(csv));
    expect(errors).toEqual([]);
    expect(months).toHaveLength(1);
    await svc.deleteMonthlyActuals(store, "2026-10-01");
    for (const m of months) await svc.saveMonthlyActuals(store, m);
    const m = buildModel(await loadSnapshotForTest(store), TODAY);
    expect(m.actuals.byMonth.get("2026-10-01")?.clinicRevenue).toBe(300000);
    expect(m.actuals.byMonth.get("2026-10-01")?.activePatients).toBe(25);
  });
});

describe("タスク・外部キーの整合性", () => {
  it("マンダラ項目に紐づくタスクを作れ、存在しない項目には紐づけられない", async () => {
    const a = (await store.list("mandala_actions"))[0];
    const t = await svc.createTask(store, { title: "x", level: "week", estimate_minutes: 10, priority: 2, status: "todo", mandala_action_id: a.id });
    expect(t.mandala_action_id).toBe(a.id);
    await expect(svc.createTask(store, { title: "y", level: "week", estimate_minutes: 10, priority: 2, status: "todo", mandala_action_id: "22222222-2222-4222-8222-222222222222" })).rejects.toThrow(/foreign key/);
  });
  it("タスク削除で依存関係も消え、子タスクの親参照は外れる", async () => {
    const p = await svc.createTask(store, { title: "親", level: "month", estimate_minutes: 0, priority: 2, status: "todo" });
    const c = await svc.createTask(store, { title: "子", level: "week", estimate_minutes: 10, priority: 2, status: "todo", parent_id: p.id });
    await svc.addDependency(store, c.id, p.id);
    await expect(svc.addDependency(store, p.id, c.id)).rejects.toThrow(/循環/);
    await store.remove("tasks", { id: p.id });
    expect((await store.list("tasks")).find((t) => t.id === c.id)?.parent_id).toBeNull();
    expect(await store.list("task_dependencies")).toHaveLength(0);
  });
  it("完了にすると完了日が記録され、戻すと消える", async () => {
    const t = await svc.createTask(store, { title: "x", level: "week", estimate_minutes: 10, priority: 2, status: "todo" });
    expect((await svc.setTaskStatus(store, t.id, "done", TODAY)).completed_at).toBe(TODAY);
    expect((await svc.setTaskStatus(store, t.id, "todo", TODAY)).completed_at).toBeNull();
  });
  it("期限が開始日より前のタスクは保存できない", async () => {
    await expect(svc.createTask(store, { title: "x", level: "week", estimate_minutes: 10, priority: 2, status: "todo", start_date: "2026-11-10", due_date: "2026-11-01" })).rejects.toThrow();
  });
  it("自動生成した計画は親子関係を保って保存される", async () => {
    const { generatePlan } = await import("../domain/generator");
    const a = (await store.list("mandala_actions")).find((x) => x.kpi_source === "clinic_revenue")!;
    const drafts = generatePlan(a, "A8", TODAY, 0);
    const created = await svc.saveGeneratedPlan(store, a.id, drafts);
    expect(created).toHaveLength(drafts.length);
    const ids = new Set(created.map((t) => t.id));
    const withParent = created.filter((t) => t.parent_id);
    expect(withParent.length).toBeGreaterThan(0);
    expect(withParent.every((t) => ids.has(t.parent_id!))).toBe(true);
    expect(created.every((t) => t.mandala_action_id === a.id && t.source === "generator")).toBe(true);
  });
});

describe("マンダラの取り込み", () => {
  it("9×9 の書き出し → 取り込みで内容が一致する（形式判定つき）", async () => {
    const s = await loadSnapshotForTest(store);
    const grid = exportGrid(s.goals, s.actions);
    expect(looksLikeGrid(grid)).toBe(true);
    const data = parseGrid(parseCSV(toCSV(grid)));
    expect(data.center).toBe(s.goals.find((g) => g.code === "CENTER")?.title);
    expect(data.areas.find((a) => a.code === "B")?.actions.find((x) => x.position === 3)?.title).toBe("最初のMVP完成");
    expect(diffImport(s.goals, s.actions, data, "fill")).toHaveLength(0);
  });
  it("一覧形式：見出しから列を自動で対応付け、領域名で指定もできる", () => {
    const rows = [
      ["領域", "番号", "項目名", "期限", "KPI目標値", "単位"],
      ["中心", "0", "自由な働き方", "", "", ""],
      ["鍼灸事業", "0", "鍼灸事業", "", "", ""],
      ["鍼灸事業", "1", "コンセプト", "2027/1/31", "", ""],
      ["鍼灸事業", "8", "月商", "2030年6月", "800,000", "円"],
      ["B", "2", "開発環境", "日付じゃない", "", ""],
      ["Z", "1", "不明", "", "", ""],
    ];
    const map = guessMapping(rows[0]);
    expect(map).toMatchObject({ area: 0, position: 1, title: 2, due_date: 3, kpi_target: 4, kpi_unit: 5 });
    const { data, errors } = parseList(rows, map);
    expect(data.center).toBe("自由な働き方");
    const a = data.areas.find((x) => x.code === "A")!;
    expect(a.title).toBe("鍼灸事業");
    expect(a.actions.find((x) => x.position === 1)?.due_date).toBe("2027-01-31");
    expect(a.actions.find((x) => x.position === 8)).toMatchObject({ kpi_target: 800000, due_date: "2030-06-30" });
    expect(errors.some((e) => e.includes("日付"))).toBe(true);
    expect(errors.some((e) => e.includes("Z"))).toBe(true);
  });
  it("既定（fill）では既存の内容を変更せず、空欄だけ補完する", async () => {
    const data = { center: "別の中心目標", areas: [{ code: "A" as const, title: "別名", actions: [{ position: 2, title: "上書きされない", description: "説明を補完" }] }] };
    const r = await svc.applyMandalaImport(store, data, "fill");
    expect(r.applied).toBe(1); // 説明（空欄）だけ
    const s = await loadSnapshotForTest(store);
    const a2 = s.actions.find((x) => x.goal_id === s.goals.find((g) => g.code === "A")!.id && x.position === 2)!;
    expect(a2.title).toBe("専門メニュー設計");
    expect(a2.description).toBe("説明を補完");
    expect(s.goals.find((g) => g.code === "CENTER")?.title).toContain("2030年までに");
  });
  it("replace を選んだときだけ置き換え、変更前は監査ログに残る", async () => {
    const audited = new AuditedStore(store);
    await svc.applyMandalaImport(audited, { center: "新しい中心", areas: [{ code: "A", title: "", actions: [{ position: 1, title: "置き換え後" }] }] }, "replace");
    const s = await loadSnapshotForTest(store);
    expect(s.goals.find((g) => g.code === "CENTER")?.title).toBe("新しい中心");
    const logs = await store.list("audit_logs");
    const upd = logs.find((l) => l.table_name === "mandala_actions" && l.action === "update");
    expect((upd?.before as { title: string }).title).toBe("施術コンセプト決定");
    expect(exportList(s.goals, s.actions)[0][0]).toBe("領域");
  });
});

describe("バックアップ・復元・削除", () => {
  it("書き出したバックアップから復元すると同じデータに戻る", async () => {
    await svc.createTask(store, { title: "残したいタスク", level: "week", estimate_minutes: 10, priority: 2, status: "todo" });
    const backup = await svc.exportBackup(store);
    await svc.deleteAllData(store);
    expect(await store.list("tasks")).toHaveLength(0);
    expect(await store.list("mandala_actions")).toHaveLength(0);
    await svc.restoreBackup(store, JSON.parse(JSON.stringify(backup)));
    const s = await loadSnapshotForTest(store);
    expect(s.tasks.map((t) => t.title)).toContain("残したいタスク");
    expect(s.actions).toHaveLength(64);
    expect(s.assumptions.length).toBe(backup.data.scenario_assumptions!.length);
  });
  it("他アプリのファイルは復元しない", async () => {
    await expect(svc.restoreBackup(store, { app: "other", version: 1, exported_at: "", data: {} })).rejects.toThrow();
    expect(await store.list("mandala_actions")).toHaveLength(64);
  });
  it("ユーザーごとにデータが分離される", async () => {
    const other = new LocalStore("33333333-3333-4333-8333-333333333333", dir);
    expect(await other.list("mandala_actions")).toHaveLength(0);
    await ensureInitialized(other, TODAY);
    await svc.deleteAllData(other);
    expect(await store.list("mandala_actions")).toHaveLength(64);
  });
  it("監査ログは変更・削除できない", async () => {
    const audited = new AuditedStore(store);
    await svc.createTask(audited, { title: "x", level: "week", estimate_minutes: 10, priority: 2, status: "todo" });
    await expect(store.update("audit_logs", {}, { action: "delete" })).rejects.toThrow();
    await expect(store.remove("audit_logs", {})).rejects.toThrow();
  });
});
