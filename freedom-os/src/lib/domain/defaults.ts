import type { UserSettings } from "../types";

/** 設定の初期値（すべて設定画面から変更可能） */
export function defaultSettings(userId: string): UserSettings {
  return {
    user_id: userId,
    employment_annual_income: 5500000,
    employment_monthly_takehome: 360000,
    employment_weekly_hours: 45,
    target_monthly_revenue: 1200000,
    target_clinic_revenue: 800000,
    target_ai_revenue: 400000,
    target_annual_business_income: 12000000,
    target_year: 2030,
    independence_target_date: "2028-04-01",
    tax_social_rate: 0.3,
    living_cost_monthly: 350000,
    emergency_fund_months_min: 6,
    emergency_fund_months_target: 12,
    max_weekly_work_hours: 32,
    work_days_per_week: 4,
    family_hours_weekly_target: 20,
    daily_available_minutes: 90,
    weekly_discretionary_hours: 80,
    core_values: ["家族", "自由", "経済力", "専門性", "健康"],
    roadmap_start: "2026-11-01",
    roadmap_end: "2030-12-31",
  };
}

/** DB から読んだ数値型（numeric は文字列で返ることがある）を数値に直す */
export function normalizeSettings(s: UserSettings): UserSettings {
  const num = (v: unknown) => (v == null ? v : Number(v));
  const out = { ...s } as Record<string, unknown>;
  for (const k of Object.keys(out)) {
    if (["user_id", "independence_target_date", "roadmap_start", "roadmap_end", "core_values", "updated_at"].includes(k)) continue;
    out[k] = num(out[k]);
  }
  return out as unknown as UserSettings;
}
