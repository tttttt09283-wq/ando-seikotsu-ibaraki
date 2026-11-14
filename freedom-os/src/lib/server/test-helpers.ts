// テスト用：server-only に依存しないスナップショット読み込み
import { defaultSettings, normalizeSettings } from "../domain/defaults";
import type { Snapshot } from "../types";
import { normalizeRows } from "./normalize";
import type { UserStore } from "./store/types";

export async function loadSnapshotForTest(store: UserStore): Promise<Snapshot> {
  const l = <T extends Parameters<UserStore["list"]>[0]>(t: T) => store.list(t);
  const settings = await l("user_settings");
  return normalizeRows({
    profile: (await l("profiles"))[0] ?? null,
    settings: normalizeSettings(settings[0] ?? defaultSettings(store.userId)),
    goals: await l("mandala_goals"),
    actions: await l("mandala_actions"),
    tasks: await l("tasks"),
    dependencies: await l("task_dependencies"),
    milestones: await l("milestones"),
    revenue: await l("business_revenue"),
    expenses: await l("business_expenses"),
    clinicMetrics: await l("clinic_metrics"),
    aiMetrics: await l("ai_business_metrics"),
    household: await l("household_finances"),
    scenarios: await l("financial_scenarios"),
    assumptions: await l("scenario_assumptions"),
    criteria: await l("independence_criteria"),
    reviews: await l("weekly_reviews"),
    insights: await l("ai_insights"),
  });
}
