import { z } from "zod";
import { isIsoDate } from "@/lib/dates";
import { CsvFileError, type ParsedCsv } from "./decode";

/** エラーには値を含めない（個人情報をログ・DB に残さないため） */
export type RowError = { row: number; column: string; message: string };

export type StoreRef = { id: string; code: string };
export type ImportContext = {
  /** 取込先の既定店舗（店舗コード列が空の場合に使用） */
  defaultStoreId: string;
  /** 取込権限のある店舗 */
  allowedStores: readonly StoreRef[];
  /** 組織内の全店舗（存在しない店舗コードと権限外を区別するため） */
  allStores: readonly StoreRef[];
  /** 担当者メール → user_id（組織の有効メンバー） */
  staffByEmail?: ReadonlyMap<string, string>;
};

const FORMULA_START = /^[=+\-@\t\r]/;

const COLUMN_ALIASES: Record<string, string[]> = {
  customer_code: ["顧客番号", "customer_code"],
  family_name: ["姓", "family_name"],
  given_name: ["名", "given_name"],
  family_name_kana: ["セイ", "せい", "姓（かな）", "family_name_kana"],
  given_name_kana: ["メイ", "めい", "名（かな）", "given_name_kana"],
  phone: ["電話番号", "phone"],
  email: ["メールアドレス", "メール", "email"],
  store_code: ["店舗コード", "store_code"],
  staff_email: ["担当者メール", "staff_email"],
  consent: ["連絡同意", "consent"],
  visited_on: ["来店日", "visited_on"],
  menu_label: ["メニュー", "menu_label"],
  scheduled_at: ["予約日時", "scheduled_at"],
  status: ["ステータス", "status"],
};

export const COLUMN_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(COLUMN_ALIASES).map(([k, v]) => [k, v[0]]),
);

function resolveColumns(headers: string[], required: string[], optional: string[]) {
  const map: Record<string, string> = {};
  for (const key of [...required, ...optional]) {
    const found = COLUMN_ALIASES[key].find((alias) => headers.includes(alias));
    if (found) map[key] = found;
  }
  const missing = required.filter((k) => !map[k]);
  if (missing.length) {
    throw new CsvFileError(`必須の列がありません：${missing.map((k) => COLUMN_LABELS[k]).join("、")}`);
  }
  return map;
}

const safeText = (max: number) =>
  z
    .string()
    .max(max, `${max}文字以内で入力してください`)
    .refine((v) => !FORMULA_START.test(v), "先頭に = + - @ は使用できません");

const customerRowSchema = z.object({
  customer_code: z
    .string()
    .regex(/^[A-Za-z0-9_-]{0,30}$/, "半角英数字・ハイフン・アンダースコア（30文字以内）で入力してください")
    .refine((v) => !FORMULA_START.test(v), "先頭に = + - @ は使用できません"),
  family_name: safeText(50).min(1, "必須です"),
  given_name: safeText(50),
  family_name_kana: safeText(50),
  given_name_kana: safeText(50),
  phone: z
    .string()
    .regex(/^$|^[0-9+][0-9+() -]{0,19}$/, "電話番号の形式が正しくありません"),
  email: z.string().max(254).regex(/^$|^[^@\s]+@[^@\s]+\.[^@\s]+$/, "メールアドレスの形式が正しくありません"),
  consent: z.enum(["", "同意", "不可", "配信停止"], { message: "「同意」「不可」「配信停止」または空欄で入力してください" }),
});

export type CustomerImportRow = {
  row: number;
  customer_code: string | null;
  family_name: string;
  given_name: string;
  family_name_kana: string;
  given_name_kana: string;
  phone: string | null;
  email: string | null;
  store_id: string;
  assigned_staff_id: string | null;
  consent: "granted" | "not_allowed" | "unsubscribed" | null;
};

export type ValidationResult<T> = { rows: T[]; errors: RowError[]; total: number };

function resolveStore(code: string, ctx: ImportContext, rowNo: number, errors: RowError[]): string | null {
  if (!code) return ctx.defaultStoreId;
  const allowed = ctx.allowedStores.find((s) => s.code === code);
  if (allowed) return allowed.id;
  const exists = ctx.allStores.some((s) => s.code === code);
  errors.push({
    row: rowNo,
    column: COLUMN_LABELS.store_code,
    message: exists ? "この店舗への取込権限がありません" : "存在しない店舗コードです",
  });
  return null;
}

function pushZodErrors(err: z.ZodError, rowNo: number, errors: RowError[]) {
  for (const issue of err.issues) {
    errors.push({ row: rowNo, column: COLUMN_LABELS[String(issue.path[0])] ?? String(issue.path[0]), message: issue.message });
  }
}

/** 行番号はヘッダーを1行目として数える（Excel 上の行番号と一致させる） */
export function validateCustomerCsv(csv: ParsedCsv, ctx: ImportContext): ValidationResult<CustomerImportRow> {
  const cols = resolveColumns(
    csv.headers,
    ["family_name"],
    ["customer_code", "given_name", "family_name_kana", "given_name_kana", "phone", "email", "store_code", "staff_email", "consent"],
  );
  const errors: RowError[] = [];
  const rows: CustomerImportRow[] = [];
  const seenCodes = new Map<string, number>();

  csv.rows.forEach((raw, i) => {
    const rowNo = i + 2;
    const get = (k: string) => (cols[k] ? (raw[cols[k]] ?? "") : "");
    const before = errors.length;

    const parsed = customerRowSchema.safeParse({
      customer_code: get("customer_code"),
      family_name: get("family_name"),
      given_name: get("given_name"),
      family_name_kana: get("family_name_kana"),
      given_name_kana: get("given_name_kana"),
      phone: get("phone"),
      email: get("email"),
      consent: get("consent"),
    });
    if (!parsed.success) pushZodErrors(parsed.error, rowNo, errors);

    const code = get("customer_code");
    if (code) {
      const prev = seenCodes.get(code);
      if (prev) errors.push({ row: rowNo, column: COLUMN_LABELS.customer_code, message: `${prev}行目と顧客番号が重複しています` });
      else seenCodes.set(code, rowNo);
    }

    const storeId = resolveStore(get("store_code"), ctx, rowNo, errors);

    let staffId: string | null = null;
    const staffEmail = get("staff_email").toLowerCase();
    if (staffEmail) {
      staffId = ctx.staffByEmail?.get(staffEmail) ?? null;
      if (!staffId) errors.push({ row: rowNo, column: COLUMN_LABELS.staff_email, message: "組織に所属していないスタッフです" });
    }

    if (errors.length === before && parsed.success && storeId) {
      const d = parsed.data;
      rows.push({
        row: rowNo,
        customer_code: d.customer_code || null,
        family_name: d.family_name,
        given_name: d.given_name,
        family_name_kana: d.family_name_kana,
        given_name_kana: d.given_name_kana,
        phone: d.phone || null,
        email: d.email || null,
        store_id: storeId,
        assigned_staff_id: staffId,
        consent: d.consent === "同意" ? "granted" : d.consent === "不可" ? "not_allowed" : d.consent === "配信停止" ? "unsubscribed" : null,
      });
    }
  });

  return { rows, errors, total: csv.rows.length };
}

function normalizeDate(v: string): string | null {
  const m = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : null;
}

export type VisitImportRow = { row: number; customer_code: string; visited_on: string; store_id: string; menu_label: string | null };

export function validateVisitCsv(csv: ParsedCsv, ctx: ImportContext, today: string): ValidationResult<VisitImportRow> {
  const cols = resolveColumns(csv.headers, ["customer_code", "visited_on"], ["store_code", "menu_label"]);
  const errors: RowError[] = [];
  const rows: VisitImportRow[] = [];
  const seen = new Set<string>();

  csv.rows.forEach((raw, i) => {
    const rowNo = i + 2;
    const get = (k: string) => (cols[k] ? (raw[cols[k]] ?? "") : "");
    const before = errors.length;

    const code = get("customer_code");
    if (!code) errors.push({ row: rowNo, column: COLUMN_LABELS.customer_code, message: "必須です" });
    const visitedOn = normalizeDate(get("visited_on"));
    if (!visitedOn) errors.push({ row: rowNo, column: COLUMN_LABELS.visited_on, message: "日付の形式が正しくありません（例：2026-11-01）" });
    else if (visitedOn > today) errors.push({ row: rowNo, column: COLUMN_LABELS.visited_on, message: "未来の日付は来店日にできません" });
    else if (visitedOn < "2000-01-01") errors.push({ row: rowNo, column: COLUMN_LABELS.visited_on, message: "2000年以降の日付を入力してください" });
    const menu = get("menu_label");
    if (menu.length > 100) errors.push({ row: rowNo, column: COLUMN_LABELS.menu_label, message: "100文字以内で入力してください" });
    if (FORMULA_START.test(menu)) errors.push({ row: rowNo, column: COLUMN_LABELS.menu_label, message: "先頭に = + - @ は使用できません" });
    const storeId = resolveStore(get("store_code"), ctx, rowNo, errors);

    const key = `${code}|${visitedOn}`;
    if (code && visitedOn && seen.has(key)) {
      errors.push({ row: rowNo, column: COLUMN_LABELS.visited_on, message: "同じ顧客・同じ日の来店が重複しています" });
    }
    seen.add(key);

    if (errors.length === before && storeId && visitedOn) {
      rows.push({ row: rowNo, customer_code: code, visited_on: visitedOn, store_id: storeId, menu_label: menu || null });
    }
  });
  return { rows, errors, total: csv.rows.length };
}

export type AppointmentImportRow = {
  row: number;
  customer_code: string;
  scheduled_at: string;
  store_id: string;
  status: "scheduled" | "confirmed" | "cancelled";
};

const APPT_STATUS: Record<string, AppointmentImportRow["status"]> = {
  "": "scheduled",
  予約済: "scheduled",
  確定: "confirmed",
  キャンセル: "cancelled",
};

/** 予約日時は組織のタイムゾーン（日本時間）の壁時計時刻として解釈し、+09:00 付き ISO にする */
export function validateAppointmentCsv(csv: ParsedCsv, ctx: ImportContext, utcOffset = "+09:00"): ValidationResult<AppointmentImportRow> {
  const cols = resolveColumns(csv.headers, ["customer_code", "scheduled_at"], ["store_code", "status"]);
  const errors: RowError[] = [];
  const rows: AppointmentImportRow[] = [];

  csv.rows.forEach((raw, i) => {
    const rowNo = i + 2;
    const get = (k: string) => (cols[k] ? (raw[cols[k]] ?? "") : "");
    const before = errors.length;

    const code = get("customer_code");
    if (!code) errors.push({ row: rowNo, column: COLUMN_LABELS.customer_code, message: "必須です" });
    const m = get("scheduled_at").match(/^(\d{4}[-/]\d{1,2}[-/]\d{1,2})[ T](\d{1,2}):(\d{2})$/);
    const date = m ? normalizeDate(m[1]) : null;
    const hour = m ? Number(m[2]) : NaN;
    if (!m || !date || hour > 23) {
      errors.push({ row: rowNo, column: COLUMN_LABELS.scheduled_at, message: "日時の形式が正しくありません（例：2026-11-20 10:30）" });
    }
    const status = APPT_STATUS[get("status")];
    if (!status) errors.push({ row: rowNo, column: COLUMN_LABELS.status, message: "「予約済」「確定」「キャンセル」または空欄で入力してください" });
    const storeId = resolveStore(get("store_code"), ctx, rowNo, errors);

    if (errors.length === before && m && date && storeId && status) {
      rows.push({
        row: rowNo,
        customer_code: code,
        scheduled_at: `${date}T${m[2].padStart(2, "0")}:${m[3]}:00${utcOffset}`,
        store_id: storeId,
        status,
      });
    }
  });
  return { rows, errors, total: csv.rows.length };
}
