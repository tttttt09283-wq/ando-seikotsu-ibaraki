// 入力検証（画面のフォームとサーバーの両方で同じスキーマを使う）
import { z } from "zod";
import { isValidDate } from "./date";

const yen = z.coerce.number({ message: "数値を入力してください" }).int("円は整数で入力してください").min(0, "0以上で入力してください").max(10_000_000_000);
const optYen = z.union([z.literal("").transform(() => null), z.null(), yen]).optional().transform((v) => (v === undefined ? null : v));
const optInt = z.union([z.literal("").transform(() => null), z.null(), z.coerce.number().int().min(0).max(1_000_000)]).optional().transform((v) => (v === undefined ? null : v));
const optNum = z.union([z.literal("").transform(() => null), z.null(), z.coerce.number().min(0).max(1_000_000)]).optional().transform((v) => (v === undefined ? null : v));
const date = z.string().refine(isValidDate, "日付の形式が正しくありません");
const optDate = z.union([z.literal("").transform(() => null), z.null(), date]).optional().transform((v) => (v === undefined ? null : v));
const month = z.string().regex(/^\d{4}-\d{2}-01$/, "月の形式が正しくありません");
const text = (max: number) => z.string().max(max, `${max}文字以内で入力してください`).default("");

export const SettingsSchema = z
  .object({
    employment_annual_income: yen,
    employment_monthly_takehome: yen,
    employment_weekly_hours: z.coerce.number().min(0).max(120),
    target_monthly_revenue: yen,
    target_clinic_revenue: yen,
    target_ai_revenue: yen,
    target_annual_business_income: yen,
    target_year: z.coerce.number().int().min(2020).max(2100),
    independence_target_date: date,
    tax_social_rate: z.coerce.number().min(0, "0〜90%").max(0.9, "0〜90%"),
    living_cost_monthly: yen,
    emergency_fund_months_min: z.coerce.number().int().min(0).max(60),
    emergency_fund_months_target: z.coerce.number().int().min(0).max(60),
    max_weekly_work_hours: z.coerce.number().min(0).max(120),
    work_days_per_week: z.coerce.number().int().min(0).max(7),
    family_hours_weekly_target: z.coerce.number().min(0).max(168),
    daily_available_minutes: z.coerce.number().int().min(0).max(1440),
    weekly_discretionary_hours: z.coerce.number().min(0).max(168),
    core_values: z.array(z.string().trim().min(1).max(20)).max(10),
    roadmap_start: date,
    roadmap_end: date,
  })
  .refine((v) => v.emergency_fund_months_target >= v.emergency_fund_months_min, { message: "目標の月数は最低月数以上にしてください", path: ["emergency_fund_months_target"] })
  .refine((v) => v.roadmap_end > v.roadmap_start, { message: "表示終了日は開始日より後にしてください", path: ["roadmap_end"] });
export type SettingsInput = z.input<typeof SettingsSchema>;

export const GoalSchema = z.object({ title: text(300), description: text(2000) });

export const ActionSchema = z.object({
  title: text(300),
  description: text(2000),
  category: text(60),
  priority: z.coerce.number().int().min(1).max(3),
  due_date: optDate,
  kpi_name: text(120),
  kpi_target: z.union([z.literal("").transform(() => null), z.null(), z.coerce.number().min(-1e12).max(1e12)]).optional().transform((v) => (v === undefined ? null : v)),
  kpi_actual: z.union([z.literal("").transform(() => null), z.null(), z.coerce.number().min(-1e12).max(1e12)]).optional().transform((v) => (v === undefined ? null : v)),
  kpi_unit: text(20),
  kpi_direction: z.enum(["higher", "lower"]),
  kpi_source: z.string().max(60),
  progress: z.coerce.number().int().min(0).max(100),
  status: z.enum(["not_started", "in_progress", "achieved", "missed"]),
  completed_at: optDate,
  memo: text(4000),
});
export type ActionInput = z.input<typeof ActionSchema>;

export const TaskSchema = z
  .object({
    title: z.string().trim().min(1, "タスク名を入力してください").max(300),
    purpose: text(1000),
    mandala_action_id: z.union([z.literal("").transform(() => null), z.null(), z.string().uuid()]).optional().transform((v) => v ?? null),
    parent_id: z.union([z.literal("").transform(() => null), z.null(), z.string().uuid()]).optional().transform((v) => v ?? null),
    level: z.enum(["long", "year", "quarter", "month", "week", "day"]),
    start_date: optDate,
    due_date: optDate,
    estimate_minutes: z.coerce.number().int().min(0).max(100000),
    actual_minutes: optInt,
    priority: z.coerce.number().int().min(1).max(3),
    status: z.enum(["todo", "doing", "done", "blocked"]),
    deliverable: text(1000),
    done_criteria: text(1000),
  })
  .refine((v) => !v.start_date || !v.due_date || v.due_date >= v.start_date, { message: "期限は開始日以降にしてください", path: ["due_date"] });
export type TaskInput = z.input<typeof TaskSchema>;

export const MilestoneSchema = z.object({
  title: z.string().trim().min(1, "名称を入力してください").max(200),
  description: text(2000),
  target_date: date,
  target_amount: optYen,
  metric: z.string().max(60).default("none"),
  area_code: z.union([z.literal("").transform(() => null), z.null(), z.enum(["A", "B", "C", "D", "E", "F", "G", "H"])]).optional().transform((v) => v ?? null),
  status: z.enum(["planned", "achieved", "missed"]),
});

export const MonthlyActualsSchema = z.object({
  month,
  revenue: z.object({
    clinic_treatment: optYen,
    clinic_other: optYen,
    ai_initial: optYen,
    ai_recurring: optYen,
    ai_product: optYen,
    ai_other: optYen,
  }),
  expenses: z.object({
    clinic_consumables: optYen,
    clinic_advertising: optYen,
    clinic_payment_fees: optYen,
    clinic_rent: optYen,
    clinic_equipment: optYen,
    clinic_other: optYen,
    ai_server: optYen,
    ai_ai_api: optYen,
    ai_outsourcing: optYen,
    ai_other: optYen,
    common_advertising: optYen,
    common_other: optYen,
  }),
  clinic: z.object({
    sessions: optInt,
    new_patients: optInt,
    active_patients: optInt,
    cancellations: optInt,
    available_slots: optInt,
    work_days: z.union([z.literal("").transform(() => null), z.null(), z.coerce.number().int().min(0).max(31)]).optional().transform((v) => (v === undefined ? null : v)),
    inquiries: optInt,
    sns_inflow: optInt,
    referrals: optInt,
  }),
  ai: z.object({
    new_contracts: optInt,
    active_contracts: optInt,
    churned_contracts: optInt,
    products_sold: optInt,
    maintenance_hours: optNum,
    dev_hours: optNum,
  }),
  household: z.object({
    employment_income_net: optYen,
    other_income: optYen,
    living_cost: optYen,
    emergency_fund_balance: optYen,
    note: text(500),
  }),
});
export type MonthlyActualsInput = z.input<typeof MonthlyActualsSchema>;

export const WeeklyReviewSchema = z.object({
  week_start: date,
  clinic_revenue: yen,
  ai_revenue: yen,
  new_customers: z.coerce.number().int().min(0).max(100000),
  returning_customers: z.coerce.number().int().min(0).max(100000),
  ai_contracts: z.coerce.number().int().min(0).max(100000),
  tasks_done: z.coerce.number().int().min(0).max(100000),
  work_hours: z.coerce.number().min(0).max(168),
  family_hours: z.coerce.number().min(0).max(168),
  wins: text(4000),
  issues: text(4000),
  next_focus: text(4000),
});
export type WeeklyReviewInput = z.input<typeof WeeklyReviewSchema>;

export const CriterionSchema = z.object({
  enabled: z.boolean(),
  threshold: z.union([z.literal("").transform(() => null), z.null(), z.coerce.number().min(0).max(1e10)]).optional().transform((v) => (v === undefined ? null : v)),
  threshold2: z.union([z.literal("").transform(() => null), z.null(), z.coerce.number().min(0).max(1e10)]).optional().transform((v) => (v === undefined ? null : v)),
  manual_confirmed: z.boolean(),
  note: text(2000),
});

export const AdvisorOutputSchema = z.object({
  current: z.string(),
  issues: z.array(z.object({ title: z.string(), detail: z.string() })),
  actions: z.array(
    z.object({
      title: z.string(),
      purpose: z.string(),
      estimate_minutes: z.number(),
      due_in_days: z.number(),
      mandala_code: z.string(),
      done_criteria: z.string(),
    }),
  ),
  expected: z.array(z.object({ metric: z.string(), target: z.string(), verification: z.string() })),
  cautions: z.array(z.string()),
});

export const ImportDataSchema = z.object({
  center: z.string().max(300),
  areas: z
    .array(
      z.object({
        code: z.enum(["A", "B", "C", "D", "E", "F", "G", "H"]),
        title: z.string().max(300),
        actions: z
          .array(
            z.object({
              position: z.number().int().min(1).max(8),
              title: z.string().max(300),
              description: z.string().max(2000).optional(),
              due_date: z.union([date, z.null()]).optional(),
              kpi_name: z.string().max(120).optional(),
              kpi_target: z.number().nullable().optional(),
              kpi_unit: z.string().max(20).optional(),
              priority: z.number().int().min(1).max(3).nullable().optional(),
              memo: z.string().max(4000).optional(),
            }),
          )
          .max(8),
      }),
    )
    .max(8),
});
