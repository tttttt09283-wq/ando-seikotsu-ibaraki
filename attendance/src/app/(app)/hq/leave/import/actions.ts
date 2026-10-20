"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { toUserMessage } from "@/lib/errors";
import { detectHeader, parseLeaveTable, type ImportIssue, type ImportRow } from "@/lib/leave/import";
import { readWorkbook } from "@/lib/leave/import-file";
import {
  detectSnapshotHeader,
  latestMonthSheet,
  nameKey,
  parseSheetMonthEnd,
  parseSnapshotTable,
  planSnapshotGrants,
  type PlannedMigrationGrant,
} from "@/lib/leave/snapshot";
import { isActiveOn, staffName, type ContractRow, type StaffRow } from "@/lib/data/types";
import { isValidDateString, todayJst } from "@/lib/time/jst";
import { basisFromSettings } from "@/lib/leave/schedule";

type Action = "create" | "adjust" | "unchanged" | "unknown_staff";

export interface GrantPreviewRow extends ImportRow {
  systemName: string | null;
  action: Action;
  currentRemaining: number | null;
}

export interface SnapshotPreviewRow {
  row: number;
  name: string;
  remaining_days: number;
  staffId: string | null;
  staffCode: string | null;
  action: Action;
  currentRemaining: number | null;
  plan: PlannedMigrationGrant[];
  note: string | null;
}

interface PreviewBase {
  ok: true;
  fileName: string;
  sheets: string[];
  sheet: string;
  issues: ImportIssue[];
}

export type PreviewResult =
  | (PreviewBase & { format: "grants"; rows: GrantPreviewRow[] })
  | (PreviewBase & { format: "snapshot"; asOf: string; rows: SnapshotPreviewRow[] })
  | { ok: false; message: string };

interface GrantCache {
  staff_id: string;
  grant_date: string;
  expiration_date: string;
  granted_days: string;
  used_days: string;
  expired_days: string;
  adjusted_days: string;
}

const remainingOf = (g: GrantCache) => Number(g.granted_days) + Number(g.adjusted_days) - Number(g.used_days) - Number(g.expired_days);

/**
 * 取込の確認（まだ登録しない）。
 * - 「スタッフID・付与日・付与日数」の列がある表 → 付与ごとの取込
 * - 「有給残」の列がある表（出勤簿・残業代計算表など）→ 月末残数の取込（氏名で照合。既定は最新月のシート）
 */
export async function previewLeaveImport(formData: FormData): Promise<PreviewResult> {
  await requireHq();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "ファイルを選択してください" };
  let sheets;
  try {
    sheets = await readWorkbook(file);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "ファイルを読み込めませんでした" };
  }
  const names = sheets.map((s) => s.name);
  const requested = String(formData.get("sheet") ?? "");
  const sheetName =
    names.find((n) => n === requested) ??
    (sheets.some((s) => detectHeader(s.table)) ? undefined : latestMonthSheet(names) ?? undefined) ??
    names[0];
  const table = sheets.find((s) => s.name === sheetName)!.table;
  const supabase = await createSupabaseServer();
  const base = { ok: true as const, fileName: file.name, sheets: names, sheet: sheetName };

  // ---- 付与ごとの取込 ----
  if (detectHeader(table) || !detectSnapshotHeader(table)) {
    const { rows, issues } = parseLeaveTable(table);
    const codes = [...new Set(rows.map((r) => r.staff_code))];
    const { data: staffData } = codes.length
      ? await supabase.from("staff_profiles").select("staff_id, staff_code, family_name, given_name").in("staff_code", codes)
      : { data: [] };
    const staffByCode = new Map(((staffData ?? []) as StaffRow[]).map((s) => [s.staff_code, s]));
    const staffIds = [...staffByCode.values()].map((s) => s.staff_id);
    const { data: grantData } = staffIds.length
      ? await supabase.from("leave_grants").select("*").in("staff_id", staffIds).order("created_at")
      : { data: [] };
    const grants = (grantData ?? []) as GrantCache[];
    const preview: GrantPreviewRow[] = rows.map((r) => {
      const staff = staffByCode.get(r.staff_code);
      if (!staff) return { ...r, systemName: null, action: "unknown_staff", currentRemaining: null };
      const grant = grants.find((g) => g.staff_id === staff.staff_id && g.grant_date === r.grant_date);
      if (!grant) return { ...r, systemName: staffName(staff), action: "create", currentRemaining: null };
      const current = remainingOf(grant);
      return {
        ...r,
        systemName: staffName(staff),
        action: Math.abs(current - (r.granted_days - r.taken_days)) < 1e-9 ? "unchanged" : "adjust",
        currentRemaining: current,
      };
    });
    return { ...base, format: "grants", rows: preview, issues };
  }

  // ---- 月末残数の取込 ----
  const requestedAsOf = String(formData.get("as_of") ?? "");
  const asOf = isValidDateString(requestedAsOf)
    ? requestedAsOf
    : (parseSheetMonthEnd(sheetName) ?? parseSheetMonthEnd(table.slice(0, 3).flat().join("")) ?? todayJst());
  const { rows, issues } = parseSnapshotTable(table);

  const [{ data: staffData }, { data: contractData }, { data: grantData }, { data: settingData }] = await Promise.all([
    supabase.from("staff_profiles").select("staff_id, staff_code, family_name, given_name, hire_date, status"),
    supabase.from("employment_contracts").select("*"),
    supabase.from("leave_grants").select("*"),
    supabase.from("staff_leave_settings").select("staff_id, grant_basis, first_base_date"),
  ]);
  const settings = (settingData ?? []) as { staff_id: string; grant_basis: string; first_base_date: string | null }[];
  const staffByKey = new Map<string, StaffRow[]>();
  for (const s of (staffData ?? []) as StaffRow[]) {
    const key = nameKey(`${s.family_name}${s.given_name}`);
    staffByKey.set(key, [...(staffByKey.get(key) ?? []), s]);
  }
  const contracts = (contractData ?? []) as ContractRow[];
  const grants = (grantData ?? []) as GrantCache[];

  const preview: SnapshotPreviewRow[] = rows.map((r) => {
    const candidates = staffByKey.get(r.nameKey) ?? [];
    const unknown = { row: r.row, name: r.name, remaining_days: r.remaining_days, staffId: null, staffCode: null, currentRemaining: null, plan: [] };
    if (candidates.length !== 1) {
      return { ...unknown, action: "unknown_staff", note: candidates.length > 1 ? "同姓同名のスタッフが複数います" : "スタッフ未登録" };
    }
    const staff = candidates[0];
    const valid = grants.filter((g) => g.staff_id === staff.staff_id && g.grant_date <= asOf && g.expiration_date >= asOf);
    const current = valid.reduce((sum, g) => sum + remainingOf(g), 0);
    const common = { row: r.row, name: r.name, remaining_days: r.remaining_days, staffId: staff.staff_id, staffCode: staff.staff_code, currentRemaining: current };
    if (Math.abs(current - r.remaining_days) < 1e-9) return { ...common, action: "unchanged", plan: [], note: null };
    if (valid.length > 0) return { ...common, action: "adjust", plan: [], note: null };
    const contract = contracts.find((c) => c.staff_id === staff.staff_id && isActiveOn(c, asOf));
    const { grants: plan, warning } = planSnapshotGrants(
      staff.hire_date,
      { weeklyDays: Number(contract?.weekly_scheduled_days ?? 5), weeklyMinutes: contract?.weekly_scheduled_minutes ?? 2400 },
      asOf,
      r.remaining_days - current,
      basisFromSettings(settings.find((x) => x.staff_id === staff.staff_id)),
    );
    return { ...common, action: "create", plan, note: warning };
  });
  return { ...base, format: "snapshot", asOf, rows: preview, issues };
}

const grantRowsSchema = z
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

/** 付与ごとの取込（1件でも誤りがあれば全件取り消し） */
export async function commitLeaveImport(input: ImportRow[], fileName: string): Promise<{ ok: boolean; message: string }> {
  await requireHq();
  const parsed = grantRowsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "取込データが正しくありません。もう一度ファイルを確認してください" };
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("import_paid_leave", {
    p_rows: parsed.data.map((r) => ({
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

const snapshotRowsSchema = z
  .array(
    z.object({
      row: z.number().int().positive(),
      staffId: z.uuid(),
      remaining_days: z.number().min(0).max(80),
      plan: z.array(z.object({ grant_date: z.iso.date(), days: z.number().positive(), expiration_date: z.iso.date() })),
    }),
  )
  .min(1)
  .max(5000);

/** 月末残数の取込（その日時点の残数に合わせる。1件でも誤りがあれば全件取り消し） */
export async function commitSnapshotImport(
  input: Pick<SnapshotPreviewRow, "row" | "staffId" | "remaining_days" | "plan">[],
  asOf: string,
  fileName: string,
): Promise<{ ok: boolean; message: string }> {
  await requireHq();
  const parsed = snapshotRowsSchema.safeParse(input);
  if (!parsed.success || !isValidDateString(asOf)) return { ok: false, message: "取込データが正しくありません。もう一度ファイルを確認してください" };
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("import_paid_leave_snapshot", {
    p_rows: parsed.data.map((r) => ({ row: r.row, staff_id: r.staffId, remaining_days: r.remaining_days, plan: r.plan })),
    p_as_of: asOf,
    p_source: String(fileName).slice(0, 200),
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  const r = data as { created: number; adjusted: number; unchanged: number };
  revalidatePath("/hq/leave", "layout");
  return { ok: true, message: `${asOf}時点の残数を取り込みました：新規 ${r.created}人・調整 ${r.adjusted}人・変更なし ${r.unchanged}人` };
}
