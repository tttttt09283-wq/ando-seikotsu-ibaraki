import { z } from "zod";

/** 同意文書のバージョン（文面を変えたら上げる。同意記録に残る） */
export const PRIVACY_VERSION = "2026-11-12";
export const CANCEL_POLICY_VERSION = "2026-11-12";

/** 相談内容の上限。症状の詳細を必要以上に集めないため短くする */
export const CONSULTATION_MAX = 200;

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const clean = (s: string) => s.replace(CONTROL_CHARS, "").trim();

/** 全角数字・ハイフン類を正規化し、数字だけにする */
export function normalizePhone(input: string): string {
  return input
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s\-‐－ー−()（）+]/g, "")
    .trim();
}

export const reservationInputSchema = z.object({
  location_id: z.string().min(1, "施術場所を選んでください").max(32),
  service_id: z.string().min(1, "メニューを選んでください").max(64),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "希望日を選んでください"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "時間を選んでください"),
  name: z
    .string()
    .transform(clean)
    .pipe(z.string().min(1, "お名前を入力してください").max(40, "お名前は40文字以内で入力してください")),
  phone: z
    .string()
    .transform(normalizePhone)
    .pipe(z.string().regex(/^0\d{9,10}$/, "電話番号は 0 から始まる10〜11桁で入力してください")),
  consultation: z
    .string()
    .optional()
    .default("")
    .transform(clean)
    .pipe(z.string().max(CONSULTATION_MAX, `ご相談内容は${CONSULTATION_MAX}文字以内でお願いします`)),
  agree_privacy: z.literal(true, { error: "個人情報の取扱いへの同意が必要です" }),
  agree_cancel_policy: z.literal(true, { error: "キャンセル規定への同意が必要です" }),
  source: z
    .string()
    .max(32)
    .regex(/^[a-z0-9_-]*$/)
    .optional()
    .catch(undefined),
  liff_id_token: z.string().max(4096).optional(),
});

export type ReservationInput = z.output<typeof reservationInputSchema>;

export function validateReservationInput(raw: unknown):
  | { ok: true; data: ReservationInput }
  | { ok: false; errors: Record<string, string> } {
  const r = reservationInputSchema.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  const errors: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = String(issue.path[0] ?? "_");
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

/** 医療効果を保証するような表現を管理者入力（メニュー説明など）から弾く */
const GUARANTEE_WORDS = ["必ず治", "完治", "絶対に治", "治ります", "100%改善", "効果を保証", "確実に改善", "根治"];
export function findGuaranteeExpression(text: string): string | null {
  return GUARANTEE_WORDS.find((w) => text.includes(w)) ?? null;
}

export const serviceInputSchema = z.object({
  name: z.string().transform(clean).pipe(z.string().min(1).max(40)),
  description: z.string().transform(clean).pipe(z.string().max(300)),
  duration_minutes: z.coerce.number().int().min(10).max(240),
  price_tax_included: z.union([z.literal("").transform(() => null), z.coerce.number().int().min(0).max(1_000_000)]),
  sort_order: z.coerce.number().int().min(0).max(999).default(0),
});

export const locationSettingsSchema = z.object({
  buffer_minutes: z.coerce.number().int().min(0).max(240),
  travel_minutes: z.coerce.number().int().min(0).max(480),
  booking_deadline_hours: z.coerce.number().int().min(0).max(24 * 30),
  max_advance_days: z.coerce.number().int().min(1).max(365),
  daily_limit: z.coerce.number().int().min(0).max(50),
  slot_interval_minutes: z.coerce.number().int().min(5).max(240),
});
