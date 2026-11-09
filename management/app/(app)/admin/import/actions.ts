"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, ForbiddenError, can, requireRecentLogin } from "@/server/session";
import { decodeCsvBytes, parseCsv, rowsToRecords } from "@/lib/csv";
import { validateBalanceRecords } from "@/lib/leave/import-balance";
import { validateStaffRecords, type StaffRowData } from "@/lib/import-staff";
import { friendlyDbError } from "@/lib/db-error";
import { jstToday } from "@/lib/time";
import { back } from "@/server/redirect-with";
import { authUsersByEmail, provisionLogin, undoProvision } from "@/server/provision";

const PATH = "/admin/import";
const MAX_BYTES = 1024 * 1024;

// CSVをアップロード → 全行を検証して保存（この時点では取り込まない）
export async function uploadCsv(fd: FormData) {
  const kind = String(fd.get("kind"));
  if (kind !== "leave_balance" && kind !== "staff") back(PATH, "err", "取り込む内容を選んでください");
  try { await requirePermission(kind === "staff" ? "master.manage" : "leave.import"); } catch (e) {
    if (e instanceof ForbiddenError) back(PATH, "err", e.message);
    throw e;
  }
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) back(PATH, "err", "CSVファイルを選んでください");
  if (file.size > MAX_BYTES) back(PATH, "err", "ファイルが大きすぎます（1MBまで）");
  if (!/\.csv$/i.test(file.name)) back(PATH, "err", "CSVファイル（.csv）を選んでください。Excelの場合は「CSV（コンマ区切り）」で保存してください");
  const { text } = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
  const { headers, records } = rowsToRecords(parseCsv(text));
  const supabase = await createClient();
  const me = (await supabase.rpc("me")).data as { id: string };

  let fileErrors: string[];
  let rows: { rowNo: number; data: unknown; errors: string[]; warnings: string[] }[];
  if (kind === "leave_balance") {
    const [{ data: users }, { data: grants }, { data: types }] = await Promise.all([
      supabase.from("users").select("id, staff_code, name"),
      supabase.from("leave_grants").select("user_id, leave_type_id, grant_date").eq("source", "migration").is("voided_at", null),
      supabase.from("leave_types").select("id, code"),
    ]);
    const codeOfUser = new Map((users ?? []).map((u) => [u.id, u.staff_code]));
    const codeOfType = new Map((types ?? []).map((t) => [t.id, t.code]));
    const r = validateBalanceRecords(headers, records, {
      today: jstToday(),
      staff: new Map((users ?? []).map((u) => [u.staff_code, { name: u.name }])),
      alreadyImported: new Set((grants ?? []).map((g) => `${codeOfUser.get(g.user_id)}|${codeOfType.get(g.leave_type_id)}|${g.grant_date}`)),
    });
    fileErrors = r.fileErrors; rows = r.rows;
  } else {
    const [{ data: stores }, { data: users }] = await Promise.all([
      supabase.from("stores").select("id, code, name").eq("is_active", true),
      supabase.from("users").select("staff_code, login_id, pos_staff_id"),
    ]);
    const r = validateStaffRecords(headers, records, {
      stores: stores ?? [],
      existingStaffCodes: new Set((users ?? []).map((u) => u.staff_code)),
      existingLoginIds: new Set((users ?? []).map((u) => u.login_id)),
      existingPosIds: new Set((users ?? []).map((u) => u.pos_staff_id).filter((v): v is number => v !== null)),
    });
    fileErrors = r.fileErrors; rows = r.rows;
  }
  if (fileErrors.length) back(PATH, "err", fileErrors.join(" ／ "));

  const errorCount = rows.filter((r) => r.errors.length).length;
  const { data: batch, error } = await supabase.from("import_batches")
    .insert({ kind, file_name: file.name.slice(0, 120), row_count: rows.length, error_count: errorCount, created_by: me.id })
    .select("id").single();
  if (error || !batch) back(PATH, "err", friendlyDbError(error));
  for (let i = 0; i < rows.length; i += 500) {
    const { error: e2 } = await supabase.from("import_rows").insert(rows.slice(i, i + 500).map((r) => ({
      batch_id: batch.id, row_no: r.rowNo, data: r.data, errors: r.errors, warnings: r.warnings,
    })));
    if (e2) back(PATH, "err", friendlyDbError(e2));
  }
  redirect(`${PATH}/${batch.id}`);
}

// 残数の取り込み（DB の import_commit：1トランザクション）
export async function commitBalance(fd: FormData) {
  await requireRecentLogin("/admin/import");
  const id = String(fd.get("batch_id"));
  const path = `${PATH}/${id}`;
  if (!(await can("leave.import"))) back(path, "err", "CSVを取り込む権限がありません");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_commit", { p_batch: id });
  if (error) back(path, "err", friendlyDbError(error));
  revalidatePath(path);
  back(path, "ok", `${data}件の残数を取り込みました`);
}

export async function rollbackBalance(fd: FormData) {
  const id = String(fd.get("batch_id"));
  const path = `${PATH}/${id}`;
  if (!(await can("leave.import"))) back(path, "err", "権限がありません");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_rollback", { p_batch: id, p_reason: String(fd.get("reason") ?? "") });
  if (error) back(path, "err", friendlyDbError(error));
  revalidatePath(path);
  back(path, "ok", `取り込みを取り消しました（${data}件の残数を取消）`);
}

// スタッフの一括登録（行ごとにログインを用意して登録。失敗した行は結果に残して次へ）
export type StaffImportState = { error?: string; results?: { rowNo: number; name: string; loginId: string; password: string | null; linkedExisting: boolean; error?: string }[] };

export async function commitStaff(_prev: StaffImportState, fd: FormData): Promise<StaffImportState> {
  await requireRecentLogin("/admin/import");
  const id = String(fd.get("batch_id"));
  if (!(await can("master.manage"))) return { error: "スタッフを登録する権限がありません" };
  const supabase = await createClient();
  const { data: batch } = await supabase.from("import_batches").select("id, kind, status, error_count").eq("id", id).single();
  if (!batch || batch.kind !== "staff") return { error: "取り込みデータが見つかりません" };
  if (batch.status !== "validated") return { error: "この取り込みはすでに実行済みです" };
  if (batch.error_count > 0) return { error: "エラーのある行があるため取り込めません。CSVを直してもう一度アップロードしてください" };
  // 二重実行を防ぐため、先に状態を変える（同時に押されても片方は 0 件更新になる）
  const { data: locked } = await supabase.from("import_batches").update({ status: "imported", executed_at: new Date().toISOString() }).eq("id", id).eq("status", "validated").select("id");
  if (!locked?.length) return { error: "この取り込みはすでに実行中か実行済みです" };
  const me = (await supabase.rpc("me")).data as { id: string };
  await supabase.from("import_batches").update({ executed_by: me.id }).eq("id", id);

  const { data: rows } = await supabase.from("import_rows").select("id, row_no, data").eq("batch_id", id).order("row_no");
  const [{ data: roles }, known] = await Promise.all([supabase.from("roles").select("id, code"), authUsersByEmail()]);
  const roleId = new Map((roles ?? []).map((r) => [r.code, r.id]));
  const results: NonNullable<StaffImportState["results"]> = [];
  for (const row of rows ?? []) {
    const d = row.data as StaffRowData;
    let prov;
    try {
      prov = await provisionLogin(d.login_id, d.name, { reissueExisting: false, known });
      const first = d.assignments[0] ?? null;
      const { error } = await supabase.rpc("register_user", {
        p_id: prov.authId, p_staff_code: d.staff_code, p_login_id: d.login_id, p_name: d.name, p_name_kana: d.name_kana,
        p_employment_type: d.employment_type, p_hire_date: d.hire_date, p_pos_staff_id: d.pos_staff_id,
        p_must_change_password: prov.password !== null, p_store: first?.store_id ?? null, p_store_role: first?.role ?? "STAFF", p_starts_on: jstToday(),
      });
      if (error) throw new Error(friendlyDbError(error));
      for (const a of d.assignments.slice(1)) {
        const { error: e } = await supabase.from("user_store_assignments").insert({ user_id: prov.authId, store_id: a.store_id, role_id: roleId.get(a.role), is_primary: false, starts_on: jstToday() });
        if (e) throw new Error(`2つ目以降の所属：${friendlyDbError(e)}`);
      }
      if (d.global_role) {
        const { error: e } = await supabase.from("user_roles").insert({ user_id: prov.authId, role_id: roleId.get(d.global_role), starts_on: jstToday() });
        if (e) throw new Error(`役職：${friendlyDbError(e)}`);
      }
      await supabase.from("import_rows").update({ result: prov.linkedExisting ? "登録（POSのIDに紐づけ）" : "登録（ID・PASS発行）" }).eq("id", row.id);
      results.push({ rowNo: row.row_no, name: d.name, loginId: d.login_id, password: prov.password, linkedExisting: prov.linkedExisting });
    } catch (e) {
      if (prov) await undoProvision(prov);
      const message = (e as Error).message;
      await supabase.from("import_rows").update({ result: `失敗：${message}` }).eq("id", row.id);
      results.push({ rowNo: row.row_no, name: d.name, loginId: d.login_id, password: null, linkedExisting: false, error: message });
    }
  }
  const failed = results.filter((r) => r.error).length;
  if (failed) await supabase.from("import_batches").update({ note: `${failed}件の登録に失敗` }).eq("id", id);
  revalidatePath("/admin/users");
  return { results };
}
