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
