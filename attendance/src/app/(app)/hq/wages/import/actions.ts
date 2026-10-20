"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { toUserMessage } from "@/lib/errors";
import { isActiveOn, staffName, type ContractRow, type StaffRow } from "@/lib/data/types";
import { MAX_IMPORT_BYTES } from "@/lib/leave/import-file";
import { latestMonthSheet, nameKey } from "@/lib/leave/snapshot";
import { wageForMonth } from "@/lib/payroll/calc";
import { parseWageSheet, type WageImportRow } from "@/lib/payroll/import";
import type { WageRow } from "@/lib/payroll/load";

export interface WagePreviewRow extends WageImportRow {
  staffId: string | null;
  staffCode: string | null;
  systemName: string | null;
  action: "create" | "change" | "unchanged" | "unknown_staff";
  note: string | null;
}

export type WagePreview =
  | { ok: true; fileName: string; sheets: string[]; sheet: string; month: string; rows: WagePreviewRow[]; issues: { row: number; message: string }[] }
  | { ok: false; message: string };

const SAME_KEYS = ["pay_type", "basic_wage", "hourly_wage", "daily_wage", "monthly_hours", "overtime_threshold_hours", "fixed_overtime_allowance", "commute_type", "commute_amount", "qualification_allowance", "misc_allowance"] as const;

/** DB の数値（文字列で返る numeric を含む）と表の値を比べられる形に */
const comparable = (v: unknown) => (v === null || v === undefined ? null : typeof v === "number" || (typeof v === "string" && v !== "" && !Number.isNaN(Number(v))) ? Number(v) : v);

/** 賃金管理表を読み、スタッフに照合して確認用の内容を返す（まだ登録しない）。既定は最新月のシート */
export async function previewWageImport(formData: FormData): Promise<WagePreview> {
  await requireHq();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "ファイルを選択してください" };
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, message: "ファイルが大きすぎます（5MBまで）。不要な月のシートを削除してください" };
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return { ok: false, message: "Excel ファイルとして読み込めませんでした（Google スプレッドシートは Excel 形式でダウンロードしてください）" };
  }
  const sheets = wb.worksheets.filter((w) => w.state === "visible").map((w) => w.name);
  const requested = String(formData.get("sheet") ?? "");
  const sheet = sheets.find((s) => s === requested) ?? latestMonthSheet(sheets) ?? sheets[0];
  const parsed = parseWageSheet(wb.getWorksheet(sheet)!);
  const monthParam = String(formData.get("month") ?? "");
  const month = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : (parsed.month ?? new Date().toISOString().slice(0, 7));

  const supabase = await createSupabaseServer();
  const [{ data: staffData }, { data: wageData }, { data: contractData }] = await Promise.all([
    supabase.from("staff_profiles").select("staff_id, staff_code, family_name, given_name, status"),
    supabase.from("staff_wage_settings").select("*"),
    supabase.from("employment_contracts").select("*"),
  ]);
  const staff = (staffData ?? []) as StaffRow[];
  const wages = (wageData ?? []) as WageRow[];
  const contracts = (contractData ?? []) as ContractRow[];

  const rows: WagePreviewRow[] = parsed.rows.map((r) => {
    const candidates = staff.filter((s) => nameKey(`${s.family_name}${s.given_name}`) === r.nameKey);
    if (candidates.length !== 1) {
      return { ...r, staffId: null, staffCode: null, systemName: null, action: "unknown_staff", note: candidates.length > 1 ? "同姓同名のスタッフが複数います" : "スタッフ未登録" };
    }
    const s = candidates[0];
    const current = wageForMonth(wages, s.staff_id, month);
    const same = current && SAME_KEYS.every((k) => comparable(current[k]) === comparable(r[k]));
    const contract = contracts.find((c) => c.staff_id === s.staff_id && isActiveOn(c, `${month}-01`));
    const notes: string[] = [];
    if (r.fixed_overtime_hours !== null && contract && contract.fixed_overtime_minutes !== Math.round(r.fixed_overtime_hours * 60)) {
      notes.push(`固定残業時間が勤務条件（${contract.fixed_overtime_minutes / 60}時間）と表（${r.fixed_overtime_hours}時間）で違います`);
    }
    if (r.fixed_overtime_hours && !contract) notes.push("勤務条件が未登録です（固定残業時間を登録してください）");
    return {
      ...r,
      staffId: s.staff_id,
      staffCode: s.staff_code,
      systemName: staffName(s),
      action: !current ? "create" : same ? "unchanged" : "change",
      note: notes.join("／") || null,
    };
  });
  return { ok: true, fileName: file.name, sheets, sheet, month, rows, issues: parsed.issues };
}

const commitSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  rows: z
    .array(
      z.object({
        staffId: z.uuid(),
        pay_type: z.enum(["monthly", "hourly", "daily"]),
        basic_wage: z.number().int().min(0).nullable(),
        hourly_wage: z.number().int().min(0).nullable(),
        daily_wage: z.number().int().min(0).nullable(),
        monthly_hours: z.number().positive().nullable(),
        overtime_threshold_hours: z.number().min(0).nullable(),
        fixed_overtime_allowance: z.number().int().min(0),
        commute_type: z.enum(["none", "monthly", "per_day"]),
        commute_amount: z.number().int().min(0),
        qualification_allowance: z.number().int().min(0),
        misc_allowance: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(500),
  fileName: z.string().max(300),
});

/** 賃金マスタに登録（適用開始月＝対象月。同じ月の登録は上書き） */
export async function commitWageImport(input: z.input<typeof commitSchema>): Promise<{ ok: boolean; message: string }> {
  await requireHq();
  const parsed = commitSchema.safeParse({ ...input, rows: input.rows.map((r) => ({ ...r, basic_wage: r.basic_wage === null ? null : Math.round(r.basic_wage), misc_allowance: Math.round(r.misc_allowance), fixed_overtime_allowance: Math.round(r.fixed_overtime_allowance), qualification_allowance: Math.round(r.qualification_allowance) })) });
  if (!parsed.success) return { ok: false, message: "取込データが正しくありません。もう一度読み込んでください" };
  const supabase = await createSupabaseServer();
  let saved = 0;
  for (const { staffId, ...values } of parsed.data.rows) {
    const { error } = await supabase.rpc("save_wage_setting", {
      p_staff_id: staffId,
      p_values: { ...values, valid_from: `${parsed.data.month}-01`, note: `賃金管理表から取込：${parsed.data.fileName}` },
    });
    if (error) return { ok: false, message: `${saved}人を登録した後にエラーになりました：${toUserMessage(error)}` };
    saved += 1;
  }
  revalidatePath("/hq/wages", "layout");
  revalidatePath("/hq/payroll");
  return { ok: true, message: `${saved}人の賃金を ${parsed.data.month} から登録しました` };
}
