// 業務処理（Server Action から呼ぶ。UserStore だけに依存するのでテストできる）
import { z } from "zod";
import { addDays, monthOf } from "../date";
import { ASSUMPTION_KEYS } from "../domain/assumptions";
import type { DraftTask } from "../domain/generator";
import { wouldCreateCycle } from "../domain/tasks";
import { diffImport, type ImportMode, type MandalaImportData } from "../io/mandala-io";
import { MonthlyActualsSchema, TaskSchema } from "../schemas";
import type { AdvisorOutput, ExpenseBusiness, ExpenseCategory, MandalaAction, RevenueBusiness, RevenueCategory, TableName, Task } from "../types";
import type { UserStore } from "./store/types";

// ---------------------------------------------------------------------------
// 月次実績：1か月分のフォームを、売上・経費・指標・家計の各テーブルに分けて保存する
// 空欄は「未入力」として行を削除（0円とは区別する）
// ---------------------------------------------------------------------------
export async function saveMonthlyActuals(store: UserStore, raw: unknown) {
  const v = MonthlyActualsSchema.parse(raw);
  const m = monthOf(v.month);
  const revMap: Record<string, [RevenueBusiness, RevenueCategory]> = {
    clinic_treatment: ["clinic", "treatment"],
    clinic_other: ["clinic", "other"],
    ai_initial: ["ai", "initial"],
    ai_recurring: ["ai", "recurring"],
    ai_product: ["ai", "product"],
    ai_other: ["ai", "other"],
  };
  for (const [k, [business, category]] of Object.entries(revMap)) {
    const amount = v.revenue[k as keyof typeof v.revenue];
    if (amount == null) await store.remove("business_revenue", { month: m, business, category });
    else await store.upsert("business_revenue", [{ month: m, business, category, amount, note: "" }], ["user_id", "month", "business", "category"]);
  }
  for (const [k, amount] of Object.entries(v.expenses)) {
    const [business, ...rest] = k.split("_");
    const category = rest.join("_") as ExpenseCategory;
    if (amount == null) await store.remove("business_expenses", { month: m, business: business as ExpenseBusiness, category });
    else await store.upsert("business_expenses", [{ month: m, business: business as ExpenseBusiness, category, amount, note: "" }], ["user_id", "month", "business", "category"]);
  }
  const allNull = (o: Record<string, unknown>, skip: string[] = []) => Object.entries(o).every(([k, x]) => skip.includes(k) || x == null || x === "");
  if (allNull(v.clinic)) await store.remove("clinic_metrics", { month: m });
  else await store.upsert("clinic_metrics", [{ month: m, ...v.clinic }], ["user_id", "month"]);
  if (allNull(v.ai)) await store.remove("ai_business_metrics", { month: m });
  else await store.upsert("ai_business_metrics", [{ month: m, ...v.ai }], ["user_id", "month"]);
  if (allNull(v.household, ["note"]) && !v.household.note) await store.remove("household_finances", { month: m });
  else await store.upsert("household_finances", [{ month: m, ...v.household }], ["user_id", "month"]);
  return m;
}

export async function deleteMonthlyActuals(store: UserStore, month: string) {
  const m = monthOf(month);
  for (const t of ["business_revenue", "business_expenses", "clinic_metrics", "ai_business_metrics", "household_finances"] as const) await store.remove(t, { month: m });
}

// ---------------------------------------------------------------------------
// マンダラの取り込み（fill：空欄だけ補完／replace：取り込みデータで置き換え）
// ---------------------------------------------------------------------------
export async function applyMandalaImport(store: UserStore, data: MandalaImportData, mode: ImportMode) {
  const goals = await store.list("mandala_goals");
  const actions = await store.list("mandala_actions");
  const changes = diffImport(goals, actions, data, mode);
  const applied = changes.filter((c) => c.applied);
  if (!applied.length) return { applied: 0, skipped: changes.length };

  const positions: Record<string, number> = { CENTER: 0, A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8 };
  const ensureGoal = async (code: string) => {
    const g = goals.find((x) => x.code === code);
    if (g) return g;
    const [created] = await store.upsert("mandala_goals", [{ code: code as never, position: positions[code], title: "", description: "" }], ["user_id", "position"]);
    goals.push(created);
    return created;
  };
  const decide = (before: unknown, next: unknown) => mode === "replace" || before == null || String(before).trim() === "";

  if (data.center) {
    const g = await ensureGoal("CENTER");
    if (decide(g.title, data.center) && g.title !== data.center) await store.update("mandala_goals", { id: g.id }, { title: data.center });
  }
  for (const area of data.areas) {
    const g = await ensureGoal(area.code);
    if (area.title && g.title !== area.title && decide(g.title, area.title)) await store.update("mandala_goals", { id: g.id }, { title: area.title });
    for (const ia of area.actions) {
      const ex = actions.find((x) => x.goal_id === g.id && x.position === ia.position);
      const patch: Partial<MandalaAction> = {};
      const fields = ["title", "description", "due_date", "kpi_name", "kpi_target", "kpi_unit", "priority", "memo"] as const;
      for (const f of fields) {
        const nv = ia[f];
        if (nv == null || nv === "") continue;
        const bv = ex ? ex[f] : null;
        if (ex && f === "priority" && mode === "fill") continue; // 既存行の優先順位は上書きしない
        if (decide(bv, nv)) (patch as Record<string, unknown>)[f] = nv;
      }
      if (!Object.keys(patch).length) continue;
      if (ex) await store.update("mandala_actions", { id: ex.id }, patch);
      else
        await store.insert("mandala_actions", [
          {
            goal_id: g.id,
            position: ia.position,
            title: "",
            description: "",
            category: area.title || "",
            priority: 2,
            due_date: null,
            kpi_name: "",
            kpi_target: null,
            kpi_actual: null,
            kpi_unit: "",
            kpi_direction: "higher",
            kpi_source: "manual",
            progress: 0,
            status: "not_started",
            completed_at: null,
            memo: "",
            ...patch,
          },
        ]);
    }
  }
  return { applied: applied.length, skipped: changes.length - applied.length };
}

// ---------------------------------------------------------------------------
// タスク
// ---------------------------------------------------------------------------
export async function createTask(store: UserStore, raw: unknown, source: Task["source"] = "manual") {
  const v = TaskSchema.parse(raw);
  const [t] = await store.insert("tasks", [{ ...v, source, completed_at: v.status === "done" ? v.due_date ?? null : null }]);
  return t;
}

export async function updateTask(store: UserStore, id: string, raw: unknown, today: string) {
  const v = TaskSchema.parse(raw);
  if (v.parent_id === id) throw new Error("自分自身を親タスクにはできません");
  const [cur] = (await store.list("tasks")).filter((t) => t.id === id);
  if (!cur) throw new Error("タスクが見つかりません");
  const completed_at = v.status === "done" ? cur.completed_at ?? today : null;
  const [t] = await store.update("tasks", { id }, { ...v, completed_at });
  return t;
}

export async function setTaskStatus(store: UserStore, id: string, status: Task["status"], today: string) {
  const [t] = await store.update("tasks", { id }, { status, completed_at: status === "done" ? today : null });
  if (!t) throw new Error("タスクが見つかりません");
  return t;
}

export async function addDependency(store: UserStore, taskId: string, dependsOn: string) {
  const deps = await store.list("task_dependencies");
  if (deps.some((d) => d.task_id === taskId && d.depends_on_task_id === dependsOn)) return;
  if (wouldCreateCycle(deps, taskId, dependsOn)) throw new Error("依存関係が循環するため追加できません");
  await store.insert("task_dependencies", [{ task_id: taskId, depends_on_task_id: dependsOn }]);
}

/** 自動生成した計画を保存（親子関係を一時IDから本IDへ置き換える） */
export async function saveGeneratedPlan(store: UserStore, actionId: string, drafts: DraftTask[]) {
  const actions = await store.list("mandala_actions");
  if (!actions.some((a) => a.id === actionId)) throw new Error("マンダラ項目が見つかりません");
  const idMap = new Map<string, string>();
  const created: Task[] = [];
  // 親から順に保存
  const order = [...drafts].sort((a, b) => ["long", "year", "quarter", "month", "week", "day"].indexOf(a.level) - ["long", "year", "quarter", "month", "week", "day"].indexOf(b.level));
  for (const d of order) {
    const parsed = TaskSchema.parse({
      title: d.title,
      purpose: d.purpose,
      mandala_action_id: actionId,
      parent_id: d.parentTempId ? idMap.get(d.parentTempId) ?? null : null,
      level: d.level,
      start_date: d.start_date,
      due_date: d.due_date,
      estimate_minutes: d.estimate_minutes,
      priority: d.priority,
      status: "todo",
      deliverable: d.deliverable,
      done_criteria: d.done_criteria,
    });
    const [t] = await store.insert("tasks", [{ ...parsed, source: "generator", completed_at: null }]);
    idMap.set(d.tempId, t.id);
    created.push(t);
  }
  return created;
}

// ---------------------------------------------------------------------------
// シナリオ
// ---------------------------------------------------------------------------
export async function saveAssumptions(store: UserStore, scenarioId: string, values: Record<string, unknown>) {
  const scenarios = await store.list("financial_scenarios");
  if (!scenarios.some((s) => s.id === scenarioId)) throw new Error("シナリオが見つかりません");
  const rows = Object.entries(values)
    .filter(([k]) => (ASSUMPTION_KEYS as readonly string[]).includes(k))
    .map(([key, v]) => {
      const value = Number(v);
      if (!Number.isFinite(value)) throw new Error(`${key} に数値を入力してください`);
      if (value < -1e10 || value > 1e10) throw new Error(`${key} の値が大きすぎます`);
      return { scenario_id: scenarioId, key, value };
    });
  await store.upsert("scenario_assumptions", rows, ["scenario_id", "key"]);
  return rows.length;
}

export async function setPrimaryScenario(store: UserStore, scenarioId: string) {
  const scenarios = await store.list("financial_scenarios");
  if (!scenarios.some((s) => s.id === scenarioId)) throw new Error("シナリオが見つかりません");
  // 一意インデックス（主シナリオは1件）に触れないよう、先に全て外してから設定
  for (const s of scenarios.filter((x) => x.is_primary && x.id !== scenarioId)) await store.update("financial_scenarios", { id: s.id }, { is_primary: false });
  await store.update("financial_scenarios", { id: scenarioId }, { is_primary: true });
}

// ---------------------------------------------------------------------------
// AI 提案の承認 → タスク登録（自動では登録しない）
// ---------------------------------------------------------------------------
export async function approveInsightAction(store: UserStore, insightId: string, index: number, today: string) {
  const insights = await store.list("ai_insights");
  const ins = insights.find((x) => x.id === insightId);
  if (!ins) throw new Error("分析結果が見つかりません");
  const out = ins.output as AdvisorOutput;
  const a = out.actions?.[index];
  if (!a) throw new Error("提案が見つかりません");
  if ((ins.approved_action_indexes ?? []).includes(index)) throw new Error("この提案は登録済みです");
  // マンダラのコード（例 A8）から紐づけ先を探す
  let actionId: string | null = null;
  const m = a.mandala_code?.match(/^([A-H])([1-8])$/);
  if (m) {
    const goals = await store.list("mandala_goals");
    const g = goals.find((x) => x.code === m[1]);
    const acts = await store.list("mandala_actions");
    actionId = g ? acts.find((x) => x.goal_id === g.id && x.position === Number(m[2]))?.id ?? null : null;
  }
  const task = await createTask(
    store,
    {
      title: a.title.slice(0, 300),
      purpose: a.purpose.slice(0, 1000),
      mandala_action_id: actionId,
      level: "week",
      start_date: today,
      due_date: addDays(today, Math.max(0, Math.min(90, Math.round(a.due_in_days || 7)))),
      estimate_minutes: Math.max(5, Math.min(600, Math.round(a.estimate_minutes || 30))),
      priority: 1,
      status: "todo",
      deliverable: "",
      done_criteria: (a.done_criteria ?? "").slice(0, 1000),
    },
    "ai",
  );
  await store.update("ai_insights", { id: insightId }, { approved_action_indexes: [...(ins.approved_action_indexes ?? []), index] });
  return task;
}

// ---------------------------------------------------------------------------
// バックアップ（JSON）・復元・全削除
// ---------------------------------------------------------------------------
export const BACKUP_TABLES = [
  "user_settings",
  "mandala_goals",
  "mandala_actions",
  "tasks",
  "task_dependencies",
  "milestones",
  "business_revenue",
  "business_expenses",
  "clinic_metrics",
  "ai_business_metrics",
  "household_finances",
  "financial_scenarios",
  "scenario_assumptions",
  "independence_criteria",
  "weekly_reviews",
  "ai_insights",
] as const satisfies readonly TableName[];

export interface Backup {
  app: "freedom-os";
  version: 1;
  exported_at: string;
  data: Partial<Record<(typeof BACKUP_TABLES)[number], Record<string, unknown>[]>>;
}

export async function exportBackup(store: UserStore): Promise<Backup> {
  const data: Backup["data"] = {};
  for (const t of BACKUP_TABLES) data[t] = (await store.list(t)) as unknown as Record<string, unknown>[];
  return { app: "freedom-os", version: 1, exported_at: new Date().toISOString(), data };
}

const BackupSchema = z.object({ app: z.literal("freedom-os"), version: z.literal(1), exported_at: z.string(), data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))) });

/** 子テーブルから順に消す（外部キーの都合） */
const DELETE_ORDER: (typeof BACKUP_TABLES)[number][] = [
  "task_dependencies",
  "tasks",
  "mandala_actions",
  "mandala_goals",
  "scenario_assumptions",
  "financial_scenarios",
  "milestones",
  "business_revenue",
  "business_expenses",
  "clinic_metrics",
  "ai_business_metrics",
  "household_finances",
  "independence_criteria",
  "weekly_reviews",
  "ai_insights",
  "user_settings",
];

export async function deleteAllData(store: UserStore) {
  for (const t of DELETE_ORDER) {
    const rows = await store.list(t);
    if (rows.length) await store.remove(t, {});
  }
}

/**
 * バックアップから復元：現在のデータを全て置き換える。
 * 行の user_id は必ずログイン中のユーザーに付け替える（他人のデータは入らない）。
 */
export async function restoreBackup(store: UserStore, raw: unknown) {
  const b = BackupSchema.parse(raw);
  await deleteAllData(store);
  const strip = (r: Record<string, unknown>) => {
    const o = { ...r };
    delete o.user_id;
    delete o.created_at;
    delete o.updated_at;
    return o;
  };
  const order: (typeof BACKUP_TABLES)[number][] = [...DELETE_ORDER].reverse();
  // tasks は親子があるので parent_id を後から戻す
  let count = 0;
  for (const t of order) {
    const rows = (b.data[t] ?? []).map(strip);
    if (!rows.length) continue;
    if (t === "tasks") {
      const parents = rows.map((r) => ({ id: r.id, parent_id: r.parent_id }));
      await store.insert("tasks", rows.map((r) => ({ ...r, parent_id: null })) as never);
      for (const p of parents) if (p.parent_id) await store.update("tasks", { id: p.id as string }, { parent_id: p.parent_id as string });
    } else if (t === "user_settings") {
      await store.upsert("user_settings", rows as never, ["user_id"]);
    } else await store.insert(t, rows as never);
    count += rows.length;
  }
  return count;
}
