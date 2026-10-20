import { z } from "zod";
import { ROLES } from "@/lib/auth/permissions";
import { isValidDateString } from "@/lib/time/jst";

const requiredText = (label: string, max = 100) =>
  z
    .string({ error: `${label}を入力してください` })
    .trim()
    .min(1, `${label}を入力してください`)
    .max(max, `${label}は${max}文字以内で入力してください`);

const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, `${max}文字以内で入力してください`)
    .optional()
    .transform((v) => (v ? v : null));

const dateString = (label: string) =>
  z
    .string({ error: `${label}を入力してください` })
    .refine(isValidDateString, `${label}を正しい日付で入力してください`);

const optionalDate = (label: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || isValidDateString(v), `${label}を正しい日付で入力してください`);

const uuid = (label: string) => z.uuid({ error: `${label}を選択してください` });

// ===== 店舗 =====
export const clinicCreateSchema = z.object({
  clinic_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,20}$/, "院コードは英大文字・数字・_・- の2〜20文字で入力してください"),
  name: requiredText("院名", 50),
  opened_on: optionalDate("開院日"),
  display_order: z.coerce.number().int().min(0).max(9999).default(0),
});

export const clinicRenameSchema = z.object({
  clinic_id: uuid("店舗"),
  name: requiredText("新しい院名", 50),
});

export const clinicStatusSchema = z.object({
  clinic_id: uuid("店舗"),
  status: z.enum(["active", "suspended", "closed"], { error: "状態を選択してください" }),
  effective_date: dateString("適用日"),
  reason: requiredText("理由", 500),
});

// ===== スタッフ =====
export const staffCodeSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{4,8}$/, "スタッフIDは4〜8桁の数字で入力してください");

const privateDetailsShape = {
  birth_date: optionalDate("生年月日"),
  phone: optionalText(30),
  email: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.email().safeParse(v).success, "メールアドレスの形式が正しくありません"),
  postal_code: optionalText(10),
  address: optionalText(200),
  emergency_contact_name: optionalText(50),
  emergency_contact_phone: optionalText(30),
  notes: optionalText(1000),
};

export const staffCreateSchema = z.object({
  staff_code: staffCodeSchema,
  family_name: requiredText("姓", 30),
  given_name: requiredText("名", 30),
  family_name_kana: optionalText(30),
  given_name_kana: optionalText(30),
  hire_date: dateString("入社日"),
  primary_clinic_id: uuid("所属院"),
  ...privateDetailsShape,
});

export const staffUpdateSchema = z.object({
  staff_id: uuid("スタッフ"),
  family_name: requiredText("姓", 30),
  given_name: requiredText("名", 30),
  family_name_kana: optionalText(30),
  given_name_kana: optionalText(30),
  hire_date: dateString("入社日"),
  retire_date: optionalDate("退職日"),
  status: z.enum(["active", "on_leave", "retired"], { error: "在籍状態を選択してください" }),
  ...privateDetailsShape,
});

export const staffTransferSchema = z.object({
  staff_id: uuid("スタッフ"),
  new_clinic_id: uuid("異動先の院"),
  effective_date: dateString("異動日"),
  note: optionalText(200),
});

export const supportAssignmentSchema = z
  .object({
    staff_id: uuid("スタッフ"),
    clinic_id: uuid("応援先の院"),
    valid_from: dateString("開始日"),
    valid_to: optionalDate("終了日"),
    note: optionalText(200),
  })
  .refine((v) => v.valid_to === null || v.valid_to >= v.valid_from, {
    message: "終了日は開始日以降にしてください",
    path: ["valid_to"],
  });

export const endAssignmentSchema = z.object({
  assignment_id: uuid("所属"),
  valid_to: dateString("終了日"),
});

// ===== アカウント・ロール =====
export const accountCreateSchema = z.object({
  email: z.email({ error: "メールアドレスの形式が正しくありません" }).trim().toLowerCase(),
  display_name: requiredText("表示名", 50),
  password: z
    .string()
    .min(10, "初期パスワードは10文字以上にしてください")
    .max(72, "パスワードは72文字以内にしてください"),
  staff_id: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.uuid().safeParse(v).success, "スタッフの指定が正しくありません"),
});

export const roleGrantSchema = z
  .object({
    user_id: uuid("アカウント"),
    role: z.enum(ROLES, { error: "ロールを選択してください" }),
    clinic_id: z
      .string()
      .optional()
      .transform((v) => (v ? v : null)),
    valid_from: dateString("開始日"),
  })
  .refine((v) => (v.role === "clinic_manager") === (v.clinic_id !== null), {
    message: "院長ロールには担当院を指定してください（他のロールでは院を指定しません）",
    path: ["clinic_id"],
  })
  .refine((v) => v.clinic_id === null || z.uuid().safeParse(v.clinic_id).success, {
    message: "担当院の指定が正しくありません",
    path: ["clinic_id"],
  });

export const roleEndSchema = z.object({
  role_grant_id: uuid("ロール"),
  valid_to: dateString("終了日"),
});

export const passwordResetSchema = z.object({
  user_id: uuid("アカウント"),
  password: z.string().min(10, "パスワードは10文字以上にしてください").max(72, "パスワードは72文字以内にしてください"),
});

export const accountDisableSchema = z.object({
  user_id: uuid("アカウント"),
  disabled: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export const loginSchema = z.object({
  email: z.email({ error: "メールアドレスの形式が正しくありません" }).trim().toLowerCase(),
  password: z.string().min(1, "パスワードを入力してください"),
});

/** FormData を Zod で検証し、最初のエラーメッセージを返す */
export function parseForm<T extends z.ZodType>(
  schema: T,
  formData: FormData,
): { ok: true; data: z.infer<T> } | { ok: false; message: string } {
  const raw: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$")) raw[key] = value;
  }
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, message: result.error.issues[0]?.message ?? "入力内容を確認してください" };
}

// ===== 院カレンダー =====
export const businessHoursMetaSchema = z.object({
  clinic_id: uuid("店舗"),
  valid_from: dateString("適用開始日"),
});

export const calendarExceptionSchema = z.object({
  clinic_id: uuid("店舗"),
  target_date: dateString("日付"),
  is_closed: z.enum(["true", "false"], { error: "休診か特別診療かを選択してください" }).transform((v) => v === "true"),
  reason: requiredText("理由", 200),
});

export const calendarExceptionDeleteSchema = z.object({
  clinic_id: uuid("店舗"),
  exception_id: uuid("対象"),
});

export const companyHolidaySchema = z.object({
  holiday_date: dateString("日付"),
  name: requiredText("名称", 50),
  holiday_kind: z.enum(["national", "company_designated"], { error: "種別を選択してください" }),
  credit_target: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

export const holidayCreditTargetSchema = z.object({
  holiday_date: dateString("日付"),
  credit_target: z.enum(["true", "false"]).transform((v) => v === "true"),
});

// ===== 勤務条件（雇用契約） =====
const hoursToMinutes = (label: string, max: number) =>
  z.coerce
    .number({ error: `${label}を数値で入力してください` })
    .min(0, `${label}は0以上で入力してください`)
    .max(max, `${label}は${max}時間以内で入力してください`)
    .refine((v) => Number.isInteger(v * 4), `${label}は15分（0.25時間）単位で入力してください`)
    .transform((v) => Math.round(v * 60));

export const EMPLOYMENT_TYPE_LABELS = {
  full_time: "正社員",
  part_time: "パート・アルバイト",
  contract: "契約社員",
  other: "その他",
} as const;

export const contractSchema = z.object({
  staff_id: uuid("スタッフ"),
  valid_from: dateString("適用開始日"),
  employment_type: z.enum(["full_time", "part_time", "contract", "other"], { error: "雇用形態を選択してください" }),
  weekly_scheduled_days: z.coerce
    .number({ error: "週の勤務日数を入力してください" })
    .min(0)
    .max(7, "週の勤務日数は7日以内で入力してください")
    .refine((v) => Number.isInteger(v * 2), "週の勤務日数は0.5日単位で入力してください"),
  daily_scheduled_minutes: hoursToMinutes("1日の所定労働時間", 24),
  weekly_scheduled_minutes: hoursToMinutes("週の所定労働時間", 168),
  // 空欄なら雇用形態の標準（正社員 24時間、その他 0時間）を DB 側で適用する
  fixed_overtime_minutes: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v.trim() === "") return null;
      const result = hoursToMinutes("みなし残業時間", 100).safeParse(v);
      if (result.success) return result.data;
      ctx.addIssue({ code: "custom", message: result.error.issues[0]?.message ?? "みなし残業時間を確認してください" });
      return z.NEVER;
    }),
  legal_weekly_limit_minutes: z.enum(["2400", "2640"], { error: "週の法定労働時間を選択してください" }).transform(Number),
  reason: requiredText("理由", 200),
});

// ===== シフト =====
const timeString = (label: string) =>
  z.string({ error: `${label}を入力してください` }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label}を HH:mm で入力してください`);

export const shiftEditSchema = z
  .object({
    clinic_id: uuid("院"),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "年月が正しくありません"),
    mode: z.enum(["template", "custom", "day_off", "cancel"], { error: "操作を選択してください" }),
    template_id: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
    break_minutes: z.coerce.number().int().min(0).max(600).optional(),
    reason: z.string().trim().max(500).optional(),
    cells: z
      .array(
        z.object({
          staff_id: uuid("スタッフ"),
          date: dateString("日付"),
          shifts: z.array(z.object({ shift_id: uuid("シフト"), version: z.number().int(), status: z.string(), type: z.string() })),
        }),
      )
      .min(1, "シフトを入れる欄を選択してください")
      .max(500, "一度に変更できるのは500欄までです"),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "template" && !z.uuid().safeParse(v.template_id).success) {
      ctx.addIssue({ code: "custom", message: "勤務パターンを選択してください", path: ["template_id"] });
    }
    if (v.mode === "custom") {
      for (const key of ["start", "end"] as const) {
        const r = timeString(key === "start" ? "開始時刻" : "終了時刻").safeParse(v[key]);
        if (!r.success) ctx.addIssue({ code: "custom", message: r.error.issues[0].message, path: [key] });
      }
      if (v.start && v.start === v.end) ctx.addIssue({ code: "custom", message: "開始と終了が同じです", path: ["end"] });
    }
  });

export type ShiftEditInput = z.infer<typeof shiftEditSchema>;

export const shiftMonthActionSchema = z.object({
  clinic_id: uuid("院"),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "年月が正しくありません"),
});

export const shiftTemplateSchema = z.object({
  template_id: z
    .string()
    .optional()
    .transform((v) => (v ? v : null)),
  clinic_id: uuid("院"),
  name: requiredText("パターン名", 20),
  start_time: timeString("開始時刻"),
  end_time: timeString("終了時刻"),
  break_minutes: z.coerce.number({ error: "休憩を分で入力してください" }).int().min(0).max(600),
  color: z.enum(["sky", "emerald", "amber", "rose", "violet", "slate"]).default("sky"),
  display_order: z.coerce.number().int().min(0).max(9999).default(100),
});

export const shiftTemplateToggleSchema = z.object({
  template_id: uuid("勤務パターン"),
  clinic_id: uuid("院"),
  is_active: z.enum(["true", "false"]).transform((v) => v === "true"),
});

// ===== 共用端末・PIN =====
export const kioskIssueSchema = z.object({
  clinic_id: uuid("院"),
  name: requiredText("端末名", 40),
  device_id: z
    .string()
    .optional()
    .transform((v) => (v ? v : null)),
});

export const kioskDisableSchema = z.object({ device_id: uuid("端末") });

export const pinSetSchema = z.object({
  staff_id: uuid("スタッフ"),
  mode: z.enum(["random", "manual"]),
  pin: z.string().optional(),
});

export const pinUnlockSchema = z.object({ staff_id: uuid("スタッフ") });

export const legalHolidaySchema = z.object({
  clinic_id: uuid("院"),
  weekday: z.enum(["", "0", "1", "2", "3", "4", "5", "6"]).transform((v) => (v === "" ? null : Number(v))),
  reason: requiredText("理由", 200),
});

// ===== 勤怠 =====
export const attendanceRangeSchema = z.object({
  clinic_id: uuid("院"),
  from: dateString("開始日"),
  to: dateString("終了日"),
});

export const adjustmentRequestSchema = z
  .object({
    clinic_id: uuid("院"),
    staff_id: uuid("スタッフ"),
    work_date: dateString("勤務日"),
    change_type: z.enum(["add", "void", "replace"], { error: "修正の種類を選択してください" }),
    target_event_id: z
      .string()
      .optional()
      .transform((v) => (v ? v : null)),
    punch_type: z.enum(["", "clock_in", "break_start", "break_end", "clock_out"]).optional(),
    time: z.string().optional(),
    next_day: z
      .string()
      .optional()
      .transform((v) => v === "on"),
    reason: requiredText("修正理由", 300),
  })
  .superRefine((v, ctx) => {
    if (v.change_type !== "void" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time ?? "")) {
      ctx.addIssue({ code: "custom", message: "修正後の時刻を入力してください", path: ["time"] });
    }
    if (v.change_type === "add" && !v.punch_type) {
      ctx.addIssue({ code: "custom", message: "追加する打刻の種類を選択してください", path: ["punch_type"] });
    }
    if (v.change_type !== "add" && !v.target_event_id) {
      ctx.addIssue({ code: "custom", message: "修正する打刻を選択してください", path: ["target_event_id"] });
    }
  });

export const adjustmentDecisionSchema = z.object({
  request_id: uuid("申請"),
  decision: z.enum(["approve", "reject"]),
  comment: z.string().trim().max(300).optional(),
});

// ===== 休暇 =====
export const LEAVE_TYPE_LABELS = { paid: "有給休暇", holiday_credit: "振休", other: "その他休暇" } as const;
export const LEAVE_UNIT_LABELS = { full: "全日", am: "午前半休", pm: "午後半休", hour: "時間単位" } as const;

export const leaveRequestSchema = z
  .object({
    clinic_id: uuid("院"),
    staff_id: uuid("スタッフ"),
    leave_type: z.enum(["paid", "holiday_credit", "other"], { error: "休暇の種類を選択してください" }),
    start_date: dateString("開始日"),
    end_date: optionalDate("終了日"),
    unit: z.enum(["full", "am", "pm"], { error: "単位を選択してください" }),
    note: optionalText(200),
  })
  .refine((v) => v.end_date === null || v.end_date >= v.start_date, { message: "終了日は開始日以降にしてください", path: ["end_date"] });

export const leaveDecisionSchema = z.object({
  leave_request_id: uuid("申請"),
  decision: z.enum(["manager_approve", "final_approve", "reject", "cancel"]),
  comment: z.string().trim().max(300).optional(),
});

export const paidGrantSchema = z.object({
  staff_id: uuid("スタッフ"),
  grant_date: dateString("付与日"),
  days: z.coerce
    .number({ error: "日数を入力してください" })
    .positive("日数を入力してください")
    .max(40)
    .refine((v) => Number.isInteger(v * 2), "日数は0.5日単位で入力してください"),
  grant_type: z.enum(["statutory", "proportional", "advance", "manual", "migration"]),
  expiration_date: optionalDate("有効期限"),
  note: optionalText(200),
});

export const paidAdjustSchema = z.object({
  staff_id: uuid("スタッフ"),
  leave_grant_id: uuid("付与"),
  days: z.coerce
    .number({ error: "日数を入力してください" })
    .refine((v) => v !== 0 && Number.isInteger(v * 2), "日数は0.5日単位（マイナス可）で入力してください"),
  effective_date: dateString("適用日"),
  reason: requiredText("理由", 200),
});

export const eligibilitySchema = z.object({
  staff_id: uuid("スタッフ"),
  eligible: z.enum(["true", "false"]).transform((v) => v === "true"),
  valid_from: dateString("適用開始日"),
  reason: requiredText("理由", 200),
});

export const holidayCreditDecisionSchema = z.object({
  request_id: uuid("申請"),
  clinic_id: uuid("院"),
  decision: z.enum(["submit", "approve", "reject", "revoke"]),
  comment: z.string().trim().max(300).optional(),
});

export const holidayCreditExpirationSchema = z.object({
  holiday_credit_id: uuid("付与"),
  clinic_id: uuid("院"),
  expiration_date: dateString("新しい期限"),
  reason: requiredText("理由", 200),
});

export const leavePolicySchema = z.object({
  leave_type: z.enum(["paid", "holiday_credit", "other"]),
  half_day_allowed: z.string().optional().transform((v) => v === "on"),
  hourly_allowed: z.string().optional().transform((v) => v === "on"),
  agreement_note: optionalText(300),
});

export const holidayCreditPolicySchema = z.object({
  credit_type: z.enum(["substitute_holiday", "compensatory_day_off", "company_holiday_work_leave"]),
  is_active: z.string().optional().transform((v) => v === "on"),
  min_worked_minutes: z.coerce.number().int().min(1).max(1440),
  half_day_max_minutes: z.coerce.number().int().min(0).max(1440),
  expiration_rule: z.enum(["end_of_month", "one_month", "days", "none"]),
  expiration_days: z.coerce.number().int().min(1).max(730).optional().or(z.literal("").transform(() => undefined)),
});
