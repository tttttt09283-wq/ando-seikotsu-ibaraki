import "server-only";
import { cache } from "react";
import { jstDate } from "../date";
import { defaultSettings, normalizeSettings } from "../domain/defaults";
import { buildModel, type AppModel } from "../domain/model";
import type { Snapshot } from "../types";
import { ensureInitialized } from "./seed";
import { requireSession } from "./session";
import type { UserStore } from "./store/types";
import { normalizeRows } from "./normalize";

export async function loadSnapshot(store: UserStore): Promise<Snapshot> {
  const [profiles, settings, goals, actions, tasks, dependencies, milestones, revenue, expenses, clinicMetrics, aiMetrics, household, scenarios, assumptions, criteria, reviews, insights] =
    await Promise.all([
      store.list("profiles"),
      store.list("user_settings"),
      store.list("mandala_goals"),
      store.list("mandala_actions"),
      store.list("tasks"),
      store.list("task_dependencies"),
      store.list("milestones"),
      store.list("business_revenue"),
      store.list("business_expenses"),
      store.list("clinic_metrics"),
      store.list("ai_business_metrics"),
      store.list("household_finances"),
      store.list("financial_scenarios"),
      store.list("scenario_assumptions"),
      store.list("independence_criteria"),
      store.list("weekly_reviews"),
      store.list("ai_insights"),
    ]);
  const snap: Snapshot = {
    profile: profiles[0] ?? null,
    settings: normalizeSettings(settings[0] ?? defaultSettings(store.userId)),
    goals,
    actions,
    tasks,
    dependencies,
    milestones,
    revenue,
    expenses,
    clinicMetrics,
    aiMetrics,
    household,
    scenarios,
    assumptions,
    criteria,
    reviews,
    insights: insights.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")),
  };
  return normalizeRows(snap);
}

/** 画面用：ログイン確認 → 初期化 → 全データ読み込み → 計算モデル */
export const getAppModel = cache(async (): Promise<{ model: AppModel; mode: "supabase" | "local"; email: string }> => {
  const session = await requireSession();
  const today = jstDate();
  await ensureInitialized(session.store, today);
  const snap = await loadSnapshot(session.store);
  return { model: buildModel(snap, today), mode: session.mode, email: session.email };
});
