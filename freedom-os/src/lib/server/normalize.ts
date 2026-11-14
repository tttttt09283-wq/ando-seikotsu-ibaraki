import type { Snapshot } from "../types";

// PostgreSQL の numeric は環境により文字列で返ることがあるため、計算前に数値へ直す
const toNum = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const fix = <T>(rows: T[], keys: (keyof T)[]): T[] =>
  rows.map((r) => {
    const o = { ...r } as Record<string, unknown>;
    for (const k of keys) if (k in o) o[k as string] = toNum(o[k as string]);
    return o as T;
  });

export function normalizeRows(s: Snapshot): Snapshot {
  return {
    ...s,
    actions: fix(s.actions, ["kpi_target", "kpi_actual", "progress", "priority", "position"]).map((a) => ({ ...a, progress: a.progress ?? 0, priority: a.priority ?? 2 })),
    goals: fix(s.goals, ["position"]),
    tasks: fix(s.tasks, ["estimate_minutes", "actual_minutes", "priority"]).map((t) => ({ ...t, estimate_minutes: t.estimate_minutes ?? 0, priority: t.priority ?? 2 })),
    revenue: fix(s.revenue, ["amount"]).map((r) => ({ ...r, amount: r.amount ?? 0 })),
    expenses: fix(s.expenses, ["amount"]).map((r) => ({ ...r, amount: r.amount ?? 0 })),
    milestones: fix(s.milestones, ["target_amount"]),
    clinicMetrics: fix(s.clinicMetrics, ["sessions", "new_patients", "active_patients", "cancellations", "available_slots", "work_days", "inquiries", "sns_inflow", "referrals"]),
    aiMetrics: fix(s.aiMetrics, ["new_contracts", "active_contracts", "churned_contracts", "products_sold", "maintenance_hours", "dev_hours"]),
    household: fix(s.household, ["employment_income_net", "other_income", "living_cost", "emergency_fund_balance"]),
    assumptions: fix(s.assumptions, ["value"]).map((a) => ({ ...a, value: a.value ?? 0 })),
    criteria: fix(s.criteria, ["threshold", "threshold2"]),
    reviews: fix(s.reviews, ["clinic_revenue", "ai_revenue", "new_customers", "returning_customers", "ai_contracts", "tasks_done", "work_hours", "family_hours"]).map((r) => ({
      ...r,
      clinic_revenue: r.clinic_revenue ?? 0,
      ai_revenue: r.ai_revenue ?? 0,
      new_customers: r.new_customers ?? 0,
      returning_customers: r.returning_customers ?? 0,
      ai_contracts: r.ai_contracts ?? 0,
      tasks_done: r.tasks_done ?? 0,
      work_hours: r.work_hours ?? 0,
      family_hours: r.family_hours ?? 0,
    })),
  };
}
