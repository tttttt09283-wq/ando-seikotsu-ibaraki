// 初回ログイン時の初期データ投入。既存データがある場合は一切変更しない。
import { monthOf } from "../date";
import { DEFAULT_ASSUMPTIONS, SCENARIO_DESC, SCENARIO_LABEL } from "../domain/assumptions";
import { defaultSettings } from "../domain/defaults";
import { CENTER_GOAL, CRITERIA_DEFS, TEMPLATE_GOALS, TEMPLATE_MILESTONES } from "../domain/template";
import type { GoalCode, MandalaGoal, ScenarioKind } from "../types";
import type { UserStore } from "./store/types";

const POSITION: Record<GoalCode, number> = { CENTER: 0, A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8 };

/** マンダラが1件も無いときだけテンプレートを投入する */
export async function seedMandalaIfEmpty(store: UserStore): Promise<boolean> {
  const existing = await store.list("mandala_goals");
  if (existing.length > 0) return false;
  await store.upsert(
    "mandala_goals",
    [
      { position: 0, code: "CENTER", title: CENTER_GOAL, description: "" },
      ...TEMPLATE_GOALS.map((g) => ({ position: POSITION[g.code], code: g.code, title: g.title, description: "" })),
    ] as Partial<MandalaGoal>[],
    ["user_id", "position"],
    true,
  );
  const goals = await store.list("mandala_goals");
  const existingActions = await store.list("mandala_actions");
  if (existingActions.length) return true;
  const rows = TEMPLATE_GOALS.flatMap((tg) => {
    const g = goals.find((x) => x.code === tg.code)!;
    return tg.actions.map((a, i) => ({
      goal_id: g.id,
      position: i + 1,
      title: a.title,
      description: a.description ?? "",
      category: tg.category,
      priority: a.priority ?? 2,
      due_date: a.due,
      kpi_name: a.kpi?.name ?? "",
      kpi_target: a.kpi?.target ?? null,
      kpi_actual: null,
      kpi_unit: a.kpi?.unit ?? "",
      kpi_direction: a.kpi?.direction ?? "higher",
      kpi_source: a.kpi?.source ?? "manual",
      progress: 0,
      status: "not_started" as const,
      completed_at: null,
      memo: "",
    }));
  });
  await store.upsert("mandala_actions", rows, ["goal_id", "position"], true);
  return true;
}

/** 3シナリオ・独立条件は構造データなので、欠けていれば補う（既存の値は変えない） */
export async function ensureStructure(store: UserStore, today: string) {
  const scenarios = await store.list("financial_scenarios");
  const kinds: ScenarioKind[] = ["conservative", "standard", "challenge"];
  const missing = kinds.filter((k) => !scenarios.some((s) => s.kind === k));
  if (missing.length) {
    const created = await store.upsert(
      "financial_scenarios",
      missing.map((k) => ({
        kind: k,
        name: SCENARIO_LABEL[k],
        description: SCENARIO_DESC[k],
        start_month: monthOf(today),
        horizon_months: 36,
        is_primary: k === "standard" && !scenarios.some((s) => s.is_primary),
      })),
      ["user_id", "kind"],
      true,
    );
    const assumptions = created.flatMap((s) =>
      Object.entries(DEFAULT_ASSUMPTIONS[s.kind]).map(([key, value]) => ({ scenario_id: s.id, key, value })),
    );
    if (assumptions.length) await store.upsert("scenario_assumptions", assumptions, ["scenario_id", "key"], true);
  }
  const criteria = await store.list("independence_criteria");
  const missingC = CRITERIA_DEFS.filter((d) => !criteria.some((c) => c.code === d.code));
  if (missingC.length)
    await store.upsert(
      "independence_criteria",
      missingC.map((d) => ({ code: d.code, enabled: true, threshold: d.threshold, threshold2: d.threshold2, manual_confirmed: false, note: "" })),
      ["user_id", "code"],
      true,
    );
}

/**
 * 初回のみ：設定行を作り、成功したとき（＝初めての初期化）だけマイルストーンを投入する。
 * 同時アクセスで二重投入しないよう、設定行の作成を「鍵」にする。
 */
export async function ensureInitialized(store: UserStore, today: string): Promise<{ firstRun: boolean }> {
  const settings = await store.list("user_settings");
  let firstRun = false;
  if (!settings.length) {
    const created = await store.upsert("user_settings", [defaultSettings(store.userId)], ["user_id"], true);
    firstRun = created.length > 0;
    if (firstRun) {
      const profiles = await store.list("profiles");
      if (!profiles.length) await store.upsert("profiles", [{ id: store.userId, display_name: "", occupation: "鍼灸師・整骨院グループGM" }], ["id"], true);
      const ms = await store.list("milestones");
      if (!ms.length) await store.insert("milestones", TEMPLATE_MILESTONES.map((m) => ({ ...m, status: "planned" as const, achieved_at: null })));
    }
  }
  await seedMandalaIfEmpty(store);
  await ensureStructure(store, today);
  return { firstRun };
}
