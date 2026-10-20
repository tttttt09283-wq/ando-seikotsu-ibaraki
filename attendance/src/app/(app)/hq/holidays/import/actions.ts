"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { toUserMessage } from "@/lib/errors";
import { staffName, type StaffRow } from "@/lib/data/types";
import { DAY_CODES } from "@/lib/holiday/codes";
import { parseHolidayWorkbook } from "@/lib/holiday/import";
import { MAX_IMPORT_BYTES } from "@/lib/leave/import-file";
import { addMonthsToDate } from "@/lib/leave/schedule";
import { nameKey } from "@/lib/leave/snapshot";
import { todayJst } from "@/lib/time/jst";

export interface HolidayPreview {
  ok: true;
  fileName: string;
  name: string | null;
  staff: { id: string; code: string; name: string; hireDate: string } | null;
  matchNote: string | null;
  hireDate: string | null;
  firstBaseDate: string | null;
  baseDateIssue: string | null;
  periods: { sheet: string; start: string; end: string; paidNextCarry: number | null; creditRemaining: number | null }[];
  records: { date: string; code: string }[];
  creditRemaining: number | null;
  currentCredit: number | null;
  issues: { level: "error" | "warn"; message: string }[];
}

export type HolidayPreviewResult = HolidayPreview | { ok: false; fileName: string; message: string };

/** 1ファイルを読み、スタッフに照合して確認用の内容を返す（まだ登録しない） */
export async function previewHolidayFile(formData: FormData): Promise<HolidayPreviewResult> {
  await requireHq();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, fileName: "", message: "ファイルを選択してください" };
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, fileName: file.name, message: "ファイルが大きすぎます（5MBまで）" };
  if (!/\.(xlsx|xlsm)$/i.test(file.name)) return { ok: false, fileName: file.name, message: "Excel（.xlsx）ファイルを選んでください" };
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return { ok: false, fileName: file.name, message: "Excel ファイルとして読み込めませんでした" };
  }
  const parsed = parseHolidayWorkbook(wb, file.name);

  const supabase = await createSupabaseServer();
  const { data: staffData } = await supabase.from("staff_profiles").select("staff_id, staff_code, family_name, given_name, hire_date, status");
  const candidates = ((staffData ?? []) as StaffRow[]).filter((s) => parsed.nameKey && nameKey(`${s.family_name}${s.given_name}`) === parsed.nameKey);
  const staff = candidates.length === 1 ? candidates[0] : null;
  const matchNote = !parsed.name ? null : candidates.length === 0 ? "スタッフ未登録（先にスタッフを登録してください）" : candidates.length > 1 ? "同姓同名のスタッフが複数います" : null;

  let currentCredit: number | null = null;
  if (staff) {
    const { data } = await supabase.rpc("leave_balance_list", { p_on: todayJst() });
    const b = ((data ?? []) as { staff_id: string; holiday_credit_balance: string }[]).find((x) => x.staff_id === staff.staff_id);
    currentCredit = b ? Number(b.holiday_credit_balance) : 0;
  }
  const issues = [...parsed.issues];
  if (staff && parsed.hireDate && parsed.hireDate !== staff.hire_date) {
    issues.push({ level: "warn", message: `入社日がシステム（${staff.hire_date}）とファイル（${parsed.hireDate}）で違います` });
  }
  const hire = staff?.hire_date ?? parsed.hireDate;
  const baseDateIssue =
    parsed.firstBaseDate && hire && parsed.firstBaseDate > addMonthsToDate(hire, 6)
      ? `基準日（${parsed.firstBaseDate}）が入社6か月後より遅いため、基準日方式には切り替えません`
      : null;
  const latest = parsed.periods.at(-1) ?? null;
  return {
    ok: true,
    fileName: file.name,
    name: parsed.name,
    staff: staff ? { id: staff.staff_id, code: staff.staff_code, name: staffName(staff), hireDate: staff.hire_date } : null,
    matchNote,
    hireDate: parsed.hireDate,
    firstBaseDate: parsed.firstBaseDate,
    baseDateIssue,
    periods: parsed.periods.map((p) => ({ sheet: p.sheet, start: p.start, end: p.end, paidNextCarry: p.paidNextCarry, creditRemaining: p.creditRemaining })),
    records: parsed.records,
    creditRemaining: latest?.creditRemaining ?? null,
    currentCredit,
    issues,
  };
}

const commitSchema = z.object({
  staffId: z.uuid(),
  fileName: z.string().max(300),
  records: z
    .array(z.object({ date: z.iso.date(), code: z.enum(DAY_CODES.map((c) => c.code) as [string, ...string[]]) }))
    .max(3000),
  firstBaseDate: z.iso.date().nullable(),
  creditBalance: z.number().min(0).max(60).nullable(),
  balanceAsOf: z.iso.date().nullable(),
  balanceExpiration: z.iso.date().nullable(),
});

/** 1人分を取り込む（区分・基準日・振休/代休の残り）。取り込み直しても同じ結果 */
export async function commitHolidayFile(input: z.input<typeof commitSchema>): Promise<{ ok: boolean; message: string }> {
  await requireHq();
  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "取込データが正しくありません。もう一度読み込んでください" };
  const d = parsed.data;
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("import_staff_holiday_file", {
    p_staff_id: d.staffId,
    p_records: d.records,
    p_first_base_date: d.firstBaseDate,
    p_credit_balance: d.creditBalance,
    p_balance_as_of: d.balanceAsOf,
    p_balance_expiration: d.balanceExpiration,
    p_source: d.fileName,
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  const r = data as { imported: number; changed: number; kept_manual: number; skipped_closed: number; balance_created: boolean };
  revalidatePath("/hq/holidays", "layout");
  revalidatePath("/hq/leave", "layout");
  const notes = [
    `${r.imported}日（うち変更 ${r.changed}日）`,
    r.kept_manual ? `手入力済みのため据え置き ${r.kept_manual}日` : "",
    r.skipped_closed ? `締め済みの月のため対象外 ${r.skipped_closed}日` : "",
    r.balance_created ? "振休・代休の残りを移行" : "",
  ].filter(Boolean);
  return { ok: true, message: `取り込みました：${notes.join("・")}` };
}
