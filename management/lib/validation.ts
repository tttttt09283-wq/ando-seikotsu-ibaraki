// 画面からの入力の確認（サーバー側で必ず実行。DB の check 制約と同じ条件）
import { z } from "zod";
import { LOGIN_ID_PATTERN, normalizeLoginId } from "./login-id";
import { ROLE_CODES } from "./roles";

const trimmed = (max: number, label: string) =>
  z.string().transform((v) => v.trim()).pipe(z.string().min(1, `${label}を入力してください`).max(max, `${label}は${max}文字以内です`));
const optionalDate = z.string().trim().optional().transform((v) => (v ? v : null))
  .refine((v) => v === null || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))), "日付が正しくありません");
const optionalInt = z.string().trim().optional().transform((v) => (v ? Number(v) : null))
  .refine((v) => v === null || (Number.isInteger(v) && v > 0), "数値が正しくありません");
const uuid = z.string().uuid("選択が正しくありません");

export const storeSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,20}$/, "店舗コードは半角英大文字・数字・_ の2〜20文字です"),
  name: trimmed(40, "店舗名"),
  area_id: z.string().optional().transform((v) => (v ? v : null)).pipe(uuid.nullable()),
  display_order: z.coerce.number().int().min(0).max(999).default(0),
  is_active: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  opened_on: optionalDate,
  pos_store_id: optionalInt,
});

export const areaSchema = z.object({ name: trimmed(40, "エリア名"), display_order: z.coerce.number().int().min(0).max(999).default(0) });

export const userSchema = z.object({
  staff_code: z.string().trim().regex(/^[A-Za-z0-9_-]{1,20}$/, "スタッフIDは半角英数字・_・- の20文字以内です"),
  login_id: z.string().transform(normalizeLoginId).pipe(z.string().regex(LOGIN_ID_PATTERN, "ログインIDは半角英小文字・数字（._- 可）の3〜32文字で、英数字から始めてください")),
  name: trimmed(40, "氏名"),
  name_kana: z.string().trim().max(60).optional().transform((v) => (v ? v : null)),
  employment_type: z.enum(["役員", "正社員", "短時間正社員", "アルバイト"], { message: "雇用区分を選んでください" }),
  hire_date: optionalDate,
  pos_staff_id: optionalInt,
});

export const assignmentSchema = z.object({
  store_id: uuid,
  role: z.enum(["MANAGER", "STAFF", "PART_TIMER"], { message: "店舗での役職を選んでください" }),
  is_primary: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  starts_on: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "開始日を入力してください"),
});

export const globalRoleSchema = z.object({
  role: z.enum(["PRESIDENT", "GM", "BM"], { message: "役職を選んでください" }),
  area_id: z.string().optional().transform((v) => (v ? v : null)),
  starts_on: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "開始日を入力してください"),
}).refine((v) => (v.role === "BM") === (v.area_id !== null), { message: "BMには担当エリアが必要です（社長・GMには不要）", path: ["area_id"] });

export const roleCodeSchema = z.enum(ROLE_CODES);

// zod のエラー → 画面に出す1行
export function firstError(e: z.ZodError): string {
  return e.issues[0]?.message ?? "入力が正しくありません";
}

export function formToObject(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") o[k] = v;
  return o;
}
