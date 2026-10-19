import { z } from "zod";
import { isValidDate } from "@/lib/cash/dates";
import { IN_CATEGORIES, OUT_CATEGORIES } from "@/lib/cash/types";

/** 画面からの入力の検証（金額は正の整数の円、日付は実在する日） */

const yen = z.coerce.number({ message: "金額を数字で入力してください" }).int("金額は円単位の整数で入力してください").min(1, "金額は1円以上").max(1_000_000_000_000, "金額が大きすぎます");
const signedYen = z.coerce.number({ message: "金額を数字で入力してください" }).int("金額は円単位の整数で入力してください").min(-1_000_000_000_000).max(1_000_000_000_000);
const date = z.string().refine(isValidDate, "日付が正しくありません");
const optDate = z.string().optional().transform((s) => (s ? s : null)).refine((s) => s === null || isValidDate(s), "日付が正しくありません");
const id = z.uuid("IDが正しくありません").or(z.string().regex(/^demo-[a-z0-9-]+$/, "IDが正しくありません"));
const optId = z.string().optional().transform((s) => (s ? s : null)).pipe(id.nullable());
/** フォームの "true" / "false"（未指定は true） */
const boolStr = z.enum(["true", "false"]).optional().transform((v) => v !== "false");
const text = (max: number) => z.string().trim().max(max, `${max}文字以内で入力してください`).optional().transform((s) => (s ? s : null));

/** 先頭が = + - @ などの文字列は、表計算ソフトで数式として実行されないよう無害化する（CSV出力・取込で使う） */
export function neutralizeFormula(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export const orgSchema = z.object({ name: z.string().trim().min(1, "企業名を入力してください").max(100) });

export const orgSettingsSchema = z.object({
  name: z.string().trim().min(1, "企業名を入力してください").max(100),
  min_balance_jpy: z.coerce.number().int().min(0).max(1_000_000_000_000),
  stale_after_days: z.coerce.number().int().min(1).max(90),
});

export const branchSchema = z.object({
  id: optId,
  name: z.string().trim().min(1, "店舗名を入力してください").max(60),
  is_active: boolStr,
});

export const accountSchema = z.object({
  id: optId,
  name: z.string().trim().min(1, "口座名を入力してください").max(60),
  bank_name: text(60),
  kind: z.enum(["bank", "cash", "other"]),
  branch_id: optId,
  number_last4: z
    .string()
    .trim()
    .optional()
    .transform((s) => (s ? s : null))
    .refine((s) => s === null || /^[0-9]{4}$/.test(s), "口座番号は下4桁の数字だけを入力してください（全桁は保存しません）"),
  min_balance_jpy: z.coerce.number().int().min(0).max(1_000_000_000_000).default(0),
  is_active: boolStr,
});

export const snapshotSchema = z.object({
  bank_account_id: id,
  as_of_date: date,
  balance_jpy: signedYen,
  note: text(200),
});

const inCats = z.enum(IN_CATEGORIES);
const outCats = z.enum(OUT_CATEGORIES);

export const transactionSchema = z
  .object({
    direction: z.enum(["in", "out"]),
    category: z.string(),
    amount_jpy: yen,
    bank_account_id: id,
    branch_id: optId,
    status: z.enum(["planned", "confirmed"]),
    date,
    certainty: z.enum(["fixed", "expected"]).default("fixed"),
    counterparty: text(100),
    memo: text(500),
  })
  .superRefine((v, ctx) => {
    const ok = v.direction === "in" ? inCats.safeParse(v.category).success : outCats.safeParse(v.category).success;
    if (!ok) ctx.addIssue({ code: "custom", message: "入金・支払とカテゴリの組み合わせが正しくありません", path: ["category"] });
    if (v.status === "confirmed" && v.certainty === "expected") ctx.addIssue({ code: "custom", message: "確定した取引は「見込み」にできません", path: ["certainty"] });
  });

export const transferSchema = z
  .object({
    from_account_id: id,
    to_account_id: id,
    amount_jpy: yen,
    status: z.enum(["planned", "confirmed"]),
    date,
    memo: text(500),
  })
  .refine((v) => v.from_account_id !== v.to_account_id, { message: "振替元と振替先は別の口座にしてください", path: ["to_account_id"] });

export const confirmSchema = z.object({ id, confirmed_date: date, amount_jpy: yen });
export const idSchema = z.object({ id });

export const ruleSchema = z
  .object({
    id: optId,
    direction: z.enum(["in", "out"]),
    category: z.string(),
    amount_jpy: yen,
    bank_account_id: id,
    branch_id: optId,
    certainty: z.enum(["fixed", "expected"]).default("fixed"),
    counterparty: text(100),
    memo: text(500),
    frequency: z.enum(["weekly", "monthly", "yearly"]),
    interval_count: z.coerce.number().int().min(1).max(12).default(1),
    day_of_month: z.coerce.number().int().min(1).max(31).optional(),
    weekday: z.coerce.number().int().min(0).max(6).optional(),
    month_of_year: z.coerce.number().int().min(1).max(12).optional(),
    start_date: date,
    end_date: optDate,
    weekend_shift: z.enum(["none", "previous", "next"]).default("none"),
  })
  .superRefine((v, ctx) => {
    const ok = v.direction === "in" ? inCats.safeParse(v.category).success : outCats.safeParse(v.category).success;
    if (!ok) ctx.addIssue({ code: "custom", message: "入金・支払とカテゴリの組み合わせが正しくありません", path: ["category"] });
    if (v.frequency !== "weekly" && !v.day_of_month) ctx.addIssue({ code: "custom", message: "日を指定してください", path: ["day_of_month"] });
    if (v.frequency === "weekly" && v.weekday == null) ctx.addIssue({ code: "custom", message: "曜日を指定してください", path: ["weekday"] });
    if (v.frequency === "yearly" && !v.month_of_year) ctx.addIssue({ code: "custom", message: "月を指定してください", path: ["month_of_year"] });
    if (v.end_date && v.end_date < v.start_date) ctx.addIssue({ code: "custom", message: "終了日は開始日以降にしてください", path: ["end_date"] });
  });

export const memberSchema = z.object({
  email: z.email("メールアドレスが正しくありません").max(254),
  role: z.enum(["owner", "accountant", "viewer"]),
});
export const memberRoleSchema = z.object({ user_id: z.string().min(1).max(64), role: z.enum(["owner", "accountant", "viewer"]) });

export type TransactionInput = z.infer<typeof transactionSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type RuleInput = z.infer<typeof ruleSchema>;
export type AccountInput = z.infer<typeof accountSchema>;
