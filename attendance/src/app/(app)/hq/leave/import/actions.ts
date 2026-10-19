"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { toUserMessage } from "@/lib/errors";
import { parseLeaveTable, type ImportIssue, type ImportRow } from "@/lib/leave/import";
import { readSpreadsheet } from "@/lib/leave/import-file";
import { staffName, type StaffRow } from "@/lib/data/types";

export interface PreviewRow extends ImportRow {
  systemName: string | null;
  action: "create" | "adjust" | "unchanged" | "unknown_staff";
  currentRemaining: number | null;
}

export type PreviewResult =
  | { ok: true; fileName: string; rows: PreviewRow[]; issues: ImportIssue[] }
  | { ok: false; message: string };

/** 取込の確認（ファイルを読み、登録済みの付与と比べて「新規・調整・変更なし」を表示する。まだ登録しない） */
export async function previewLeaveImport(formData: FormData): Promise<PreviewResult> {
  await requireHq();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "ファイルを選択してください" };
  let table;
  try {
    table = await readSpreadsheet(file);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "ファイルを読み込めませんでした" };
  }
  const { rows, issues } = parseLeaveTable(table);

  const supabase = await createSupabaseServer();
  const codes = [...new Set(rows.map((r) => r.staff_code))];
  const { data: staffData } = codes.length
    ? await supabase.from("staff_profiles").select("staff_id, staff_code, family_name, given_name").in("staff_code", codes)
    : { data: [] };
  const staffByCode = new Map(((staffData ?? []) as StaffRow[]).map((s) => [s.staff_code, s]));
  const staffIds = [...staffByCode.values()].map((s) => s.staff_id);
  const { data: grantData } = staffIds.length
    ? await supabase
        .from("leave_grants")
        .select("staff_id, grant_date, granted_days, used_days, expired_days, adjusted_days, created_at")
        .in("staff_id", staffIds)
        .order("created_at")
    : { data: [] };
  const grants = (grantData ?? []) as {
    staff_id: string;
    grant_date: string;
    granted_days: string;
    used_days: string;
    expired_days: string;
    adjusted_days: string;
  }[];

  const preview: PreviewRow[] = rows.map((r) => {
    const staff = staffByCode.get(r.staff_code);
    if (!staff) return { ...r, systemName: null, action: "unknown_staff", currentRemaining: null };
    const grant = grants.find((g) => g.staff_id === staff.staff_id && g.grant_date === r.grant_date);
    if (!grant) return { ...r, systemName: staffName(staff), action: "create", currentRemaining: null };
    const current = Number(grant.granted_days) + Number(grant.adjusted_days) - Number(grant.used_days) - Number(grant.expired_days);
    return {
      ...r,
      systemName: staffName(staff),
      action: Math.abs(current - (r.granted_days - r.taken_days)) < 1e-9 ? "unchanged" : "adjust",
      currentRemaining: current,
    };
  });
  return { ok: true, fileName: file.name, rows: preview, issues };
}

/** 確認した内容で取り込む（1件でも誤りがあれば全件取り消し） */
const commitRowsSchema = z
  .array(
    z.object({
      row: z.number().int().positive(),
      staff_code: z.string().regex(/^[0-9]{4,8}$/),
      grant_date: z.iso.date(),
      granted_days: z.number().positive().max(40),
      taken_days: z.number().min(0).max(40),
      expiration_date: z.iso.date().nullable(),
    }),
  )
  .min(1)
  .max(5000);

export async function commitLeaveImport(input: ImportRow[], fileName: string): Promise<{ ok: boolean; message: string }> {
  await requireHq();
  const parsed = commitRowsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "取込データが正しくありません。もう一度ファイルを確認してください" };
  const rows = parsed.data;
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("import_paid_leave", {
    p_rows: rows.map((r) => ({
      row: r.row,
      staff_code: r.staff_code,
      grant_date: r.grant_date,
      granted_days: r.granted_days,
      taken_days: r.taken_days,
      expiration_date: r.expiration_date,
    })),
    p_source: String(fileName).slice(0, 200),
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  const r = data as { created: number; adjusted: number; unchanged: number };
  revalidatePath("/hq/leave", "layout");
  return { ok: true, message: `取り込みました：新規 ${r.created}件・調整 ${r.adjusted}件・変更なし ${r.unchanged}件` };
}
