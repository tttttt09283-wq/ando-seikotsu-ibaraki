"use server";
// すべての保存処理（Server Actions）。必ずログイン確認 → Zod 検証 → 本人のデータとして保存。
import { jstDate } from "@/lib/date";
import { buildAdvisorPayload, rulesAdvice } from "@/lib/domain/advisor";
import { buildModel } from "@/lib/domain/model";
import { runAdvisor } from "@/lib/server/ai";
import { aiConfigured } from "@/lib/server/env";
import { loadSnapshot } from "@/lib/server/snapshot";
import type { DraftTask } from "@/lib/domain/generator";
import type { ImportMode, MandalaImportData } from "@/lib/io/mandala-io";
import { ActionSchema, CriterionSchema, GoalSchema, ImportDataSchema, MilestoneSchema, SettingsSchema, WeeklyReviewSchema } from "@/lib/schemas";
import { run } from "@/lib/server/action";
import * as svc from "@/lib/server/services";
import { sessionOrThrow } from "@/lib/server/session";
import type { CriterionCode, Task } from "@/lib/types";
import { z } from "zod";

const Id = z.string().uuid("ID の形式が正しくありません");

// ---- 設定 ----
export async function saveSettings(input: unknown) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    const v = SettingsSchema.parse(input);
    await store.upsert("user_settings", [v], ["user_id"]);
  }, { message: "設定を保存しました" });
}

export async function saveProfile(input: unknown) {
  return run(async () => {
    const { store, userId } = await sessionOrThrow();
    const v = z.object({ display_name: z.string().max(80), occupation: z.string().max(120) }).parse(input);
    await store.upsert("profiles", [{ id: userId, ...v }], ["id"]);
  }, { message: "プロフィールを保存しました" });
}

// ---- マンダラ ----
export async function saveGoal(id: string, input: unknown) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    const v = GoalSchema.parse(input);
    const r = await store.update("mandala_goals", { id: Id.parse(id) }, v);
    if (!r.length) throw new Error("目標が見つかりません");
  }, { message: "保存しました" });
}

export async function saveAction(id: string, input: unknown) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    const v = ActionSchema.parse(input);
    const today = jstDate();
    const completed_at = v.status === "achieved" ? v.completed_at ?? today : v.completed_at;
    const r = await store.update("mandala_actions", { id: Id.parse(id) }, { ...v, completed_at });
    if (!r.length) throw new Error("項目が見つかりません");
  }, { message: "保存しました" });
}

export async function importMandala(data: MandalaImportData, mode: ImportMode) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    const parsed = ImportDataSchema.parse(data);
    const m = z.enum(["fill", "replace"]).parse(mode);
    const r = await svc.applyMandalaImport(store, parsed, m);
    await store.logEvent("import", "mandala", { mode: m, applied: r.applied, skipped: r.skipped });
    return r;
  }, { message: "マンダラを取り込みました" });
}

// ---- タスク ----
export async function createTaskAction(input: unknown) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    const t = await svc.createTask(store, input);
    return t.id;
  }, { message: "タスクを追加しました" });
}

export async function updateTaskAction(id: string, input: unknown) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    await svc.updateTask(store, Id.parse(id), input, jstDate());
  }, { message: "タスクを保存しました" });
}

export async function setTaskStatusAction(id: string, status: Task["status"]) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    await svc.setTaskStatus(store, Id.parse(id), z.enum(["todo", "doing", "done", "blocked"]).parse(status), jstDate());
  });
}

export async function deleteTaskAction(id: string) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    await store.remove("tasks", { id: Id.parse(id) });
  }, { message: "削除しました" });
}

export async function addDependencyAction(taskId: string, dependsOn: string) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    await svc.addDependency(store, Id.parse(taskId), Id.parse(dependsOn));
  }, { message: "依存関係を追加しました" });
}

export async function removeDependencyAction(taskId: string, dependsOn: string) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    await store.remove("task_dependencies", { task_id: Id.parse(taskId), depends_on_task_id: Id.parse(dependsOn) });
  });
}

export async function saveGeneratedPlanAction(actionId: string, drafts: DraftTask[]) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    if (!Array.isArray(drafts) || drafts.length > 40) throw new Error("生成タスクの件数が不正です");
    const r = await svc.saveGeneratedPlan(store, Id.parse(actionId), drafts);
    return r.length;
  }, { message: "行動計画をタスクに登録しました。今日の提案とロードマップに反映されます" });
}

// ---- マイルストーン ----
export async function saveMilestone(id: string | null, input: unknown) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    const v = MilestoneSchema.parse(input);
    const achieved_at = v.status === "achieved" ? jstDate() : null;
    if (id) {
      const r = await store.update("milestones", { id: Id.parse(id) }, { ...v, achieved_at });
      if (!r.length) throw new Error("マイルストーンが見つかりません");
    } else await store.insert("milestones", [{ ...v, achieved_at }]);
  }, { message: "マイルストーンを保存しました" });
}

export async function deleteMilestone(id: string) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    await store.remove("milestones", { id: Id.parse(id) });
  }, { message: "削除しました" });
}

// ---- 月次実績 ----
export async function saveMonthlyActualsAction(input: unknown) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    return svc.saveMonthlyActuals(store, input);
  }, { message: "月次実績を保存しました。ダッシュボード・マンダラ・独立判定に反映されます" });
}

export async function deleteMonthlyActualsAction(month: string) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    await svc.deleteMonthlyActuals(store, z.string().regex(/^\d{4}-\d{2}-01$/).parse(month));
  }, { message: "この月の実績を削除しました" });
}

// ---- シナリオ ----
export async function saveAssumptionsAction(scenarioId: string, values: Record<string, unknown>) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    return svc.saveAssumptions(store, Id.parse(scenarioId), values);
  }, { message: "シナリオを保存しました" });
}

export async function updateScenarioAction(scenarioId: string, input: unknown) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    const v = z.object({ name: z.string().trim().min(1).max(60), description: z.string().max(1000), horizon_months: z.coerce.number().int().min(12).max(120) }).parse(input);
    await store.update("financial_scenarios", { id: Id.parse(scenarioId) }, v);
  }, { message: "保存しました" });
}

export async function setPrimaryScenarioAction(scenarioId: string) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    await svc.setPrimaryScenario(store, Id.parse(scenarioId));
  }, { message: "主シナリオを変更しました" });
}

export async function setIndependenceDateAction(date: string) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    const d = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(date);
    await store.update("user_settings", {}, { independence_target_date: d });
  }, { message: "独立予定日を変更しました" });
}

// ---- 独立判定 ----
export async function saveCriterion(code: CriterionCode, input: unknown) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    const c = z.enum(["profit", "emergency_fund", "clinic_retention", "ai_stability", "preparation", "work_hours", "household"]).parse(code);
    const v = CriterionSchema.parse(input);
    await store.upsert("independence_criteria", [{ code: c, ...v }], ["user_id", "code"]);
  }, { message: "判定条件を保存しました" });
}

// ---- 週間レビュー ----
export async function saveWeeklyReview(input: unknown) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    const v = WeeklyReviewSchema.parse(input);
    const d = new Date(`${v.week_start}T00:00:00Z`).getUTCDay();
    if (d !== 1) throw new Error("週の開始日は月曜日にしてください");
    await store.upsert("weekly_reviews", [v], ["user_id", "week_start"]);
  }, { message: "週間レビューを保存しました" });
}

export async function deleteWeeklyReview(id: string) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    await store.remove("weekly_reviews", { id: Id.parse(id) });
  }, { message: "削除しました" });
}

// ---- AI 提案の承認 ----
export async function approveAdvice(insightId: string, index: number) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    await svc.approveInsightAction(store, Id.parse(insightId), z.number().int().min(0).max(10).parse(index), jstDate());
  }, { message: "タスクに登録しました" });
}

export async function deleteInsight(id: string) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    await store.remove("ai_insights", { id: Id.parse(id) });
  }, { message: "削除しました" });
}

// ---- データ管理 ----
export async function restoreBackupAction(json: unknown) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    const n = await svc.restoreBackup(store, json);
    await store.logEvent("restore", "all", { rows: n });
    return n;
  }, { message: "バックアップから復元しました" });
}

export async function deleteAllDataAction(confirm: string) {
  return run(async () => {
    if (confirm !== "すべて削除") throw new Error("確認の文字が一致しません");
    const { store } = await sessionOrThrow();
    await svc.deleteAllData(store);
    await store.logEvent("purge", "all", { at: new Date().toISOString() });
  }, { message: "すべてのデータを削除しました。初期テンプレートから再開します" });
}

export async function importActualsAction(months: unknown[]) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    if (!Array.isArray(months) || months.length > 240) throw new Error("取り込める月数は240か月までです");
    for (const m of months) await svc.saveMonthlyActuals(store, m);
    await store.logEvent("import", "monthly_actuals", { months: months.length });
    return months.length;
  }, { message: "月次実績を取り込みました" });
}

// ---- AI 経営参謀の実行（API キーが無ければルールベース） ----
export async function runAdvisorAction(kind: string) {
  return run(async () => {
    const { store } = await sessionOrThrow();
    const k = z.enum(["weekly", "monthly", "gap", "bottleneck", "timing", "time"]).parse(kind);
    const m = buildModel(await loadSnapshot(store), jstDate());
    const payload = buildAdvisorPayload(m, k);
    if (!aiConfigured()) {
      await store.insert("ai_insights", [{ kind: k, source: "rules", model: "", input_snapshot: payload as never, output: rulesAdvice(m), approved_action_indexes: [] }]);
      return "rules";
    }
    // 連続実行による費用の増加を防ぐ（60秒に1回まで）
    const last = m.snapshot.insights.find((i) => i.source === "llm");
    if (last?.created_at && Date.now() - new Date(last.created_at).getTime() < 60_000) throw new Error("AI分析は1分に1回までです。少し待ってから実行してください");
    const { output, model } = await runAdvisor(payload, k);
    await store.insert("ai_insights", [{ kind: k, source: "llm", model, input_snapshot: payload as never, output, approved_action_indexes: [] }]);
    return "llm";
  }, { message: "分析が完了しました" });
}
