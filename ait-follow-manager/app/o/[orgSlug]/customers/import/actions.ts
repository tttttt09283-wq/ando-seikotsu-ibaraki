"use server";

import { revalidatePath } from "next/cache";
import { assertCan, getOrgContext, storeIdsWith } from "@/lib/auth/context";
import { createClient } from "@/lib/db/server";
import { formString, runAction, throwIfDbError, UserFacingError } from "@/lib/actions";
import { CsvFileError, decodeCsv, parseCsv } from "@/lib/csv/decode";
import {
  validateAppointmentCsv,
  validateCustomerCsv,
  validateVisitCsv,
  type ImportContext,
  type RowError,
} from "@/lib/csv/import";
import { todayInTimeZone } from "@/lib/dates";

export type ImportState = {
  ok?: boolean;
  error?: string;
  message?: string;
  summary?: { total: number; valid: number; invalid: number; inserted: number; updated: number; skipped: number; imported: boolean };
  errors?: RowError[];
};

const CHUNK = 500;

export async function importCsv(_: ImportState, fd: FormData): Promise<ImportState> {
  const result = await runAction(async () => {
    const ctx = await getOrgContext(formString(fd, "orgSlug"));
    const kind = formString(fd, "kind");
    if (kind !== "customers" && kind !== "visits" && kind !== "appointments") throw new UserFacingError("取込の種類を選択してください");
    const defaultStoreId = formString(fd, "storeId");
    assertCan(ctx, "customer.import", defaultStoreId);
    const skipErrors = fd.get("skipErrors") === "on";

    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserFacingError("CSV ファイルを選択してください");
    if (!/\.(csv|txt)$/i.test(file.name)) throw new UserFacingError("拡張子が .csv のファイルを選択してください");

    let parsed;
    try {
      parsed = parseCsv(decodeCsv(new Uint8Array(await file.arrayBuffer())));
    } catch (e) {
      if (e instanceof CsvFileError) throw new UserFacingError(e.message);
      throw e;
    }

    const supabase = await createClient();
    const allowed = storeIdsWith(ctx, "customer.import");
    const importCtx: ImportContext = {
      defaultStoreId,
      allowedStores: ctx.stores.filter((s) => allowed.includes(s.id)),
      allStores: ctx.stores,
    };

    let validation;
    if (kind === "customers") {
      const { data: users } = await supabase.from("users").select("id, email, is_active");
      importCtx.staffByEmail = new Map((users ?? []).filter((u) => u.is_active).map((u) => [u.email.toLowerCase(), u.id]));
      validation = validateCustomerCsv(parsed, importCtx);
    } else if (kind === "visits") {
      validation = validateVisitCsv(parsed, importCtx, todayInTimeZone(ctx.org.timezone));
    } else {
      validation = validateAppointmentCsv(parsed, importCtx);
    }

    const errors: RowError[] = [...validation.errors];
    const summary = {
      total: validation.total,
      valid: validation.rows.length,
      invalid: new Set(errors.map((e) => e.row)).size,
      inserted: 0,
      updated: 0,
      skipped: 0,
      imported: false,
    };
    if (errors.length && !skipErrors) {
      return { error: "エラーがあるため取り込んでいません。修正して再度アップロードするか、「エラー行を除いて取り込む」を選択してください。", summary, errors } as ImportState;
    }

    // ---- 取込 ----
    if (kind === "customers") {
      const rows = validation.rows as ReturnType<typeof validateCustomerCsv>["rows"];
      const codes = rows.map((r) => r.customer_code).filter((c): c is string => Boolean(c));
      const existing = new Map<string, { id: string; store_id: string }>();
      for (let i = 0; i < codes.length; i += CHUNK) {
        const { data } = await supabase.from("customers").select("id, customer_code, store_id").eq("organization_id", ctx.org.id).in("customer_code", codes.slice(i, i + CHUNK));
        for (const c of data ?? []) existing.set(c.customer_code, c);
      }
      const consentFor: { customer_id: string; status: "granted" | "not_allowed" | "unsubscribed" }[] = [];

      const toInsert = rows.filter((r) => !r.customer_code || !existing.has(r.customer_code));
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const chunk = toInsert.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from("customers")
          .insert(
            chunk.map((r) => ({
              organization_id: ctx.org.id,
              store_id: r.store_id,
              customer_code: r.customer_code ?? "",
              family_name: r.family_name,
              given_name: r.given_name,
              family_name_kana: r.family_name_kana,
              given_name_kana: r.given_name_kana,
              phone: r.phone,
              email: r.email,
              assigned_staff_id: r.assigned_staff_id,
            })),
          )
          .select("id");
        throwIfDbError(error);
        data?.forEach((d, j) => chunk[j].consent && consentFor.push({ customer_id: d.id, status: chunk[j].consent! }));
        summary.inserted += data?.length ?? 0;
      }

      for (const r of rows.filter((r) => r.customer_code && existing.has(r.customer_code))) {
        const cur = existing.get(r.customer_code!)!;
        if (!allowed.includes(cur.store_id)) {
          errors.push({ row: r.row, column: "顧客番号", message: "権限のない店舗の顧客のため更新しませんでした" });
          summary.skipped++;
          continue;
        }
        const { error } = await supabase
          .from("customers")
          .update({
            store_id: r.store_id,
            family_name: r.family_name,
            given_name: r.given_name,
            family_name_kana: r.family_name_kana,
            given_name_kana: r.given_name_kana,
            phone: r.phone,
            email: r.email,
            ...(r.assigned_staff_id ? { assigned_staff_id: r.assigned_staff_id } : {}),
          })
          .eq("id", cur.id);
        if (error) {
          errors.push({ row: r.row, column: "", message: "更新できませんでした" });
          summary.skipped++;
          continue;
        }
        if (r.consent) consentFor.push({ customer_id: cur.id, status: r.consent });
        summary.updated++;
      }

      for (let i = 0; i < consentFor.length; i += CHUNK) {
        throwIfDbError(
          (
            await supabase.from("consent_records").insert(
              consentFor.slice(i, i + CHUNK).map((c) => ({
                organization_id: ctx.org.id,
                customer_id: c.customer_id,
                channel: "all" as const,
                status: c.status,
                source: "csv" as const,
                recorded_by: ctx.userId,
              })),
            )
          ).error,
        );
      }
    } else {
      // 来店・予約：顧客番号から顧客を特定（閲覧可能な顧客のみ）
      const rows = validation.rows as { row: number; customer_code: string; store_id: string }[];
      const codes = [...new Set(rows.map((r) => r.customer_code))];
      const byCode = new Map<string, string>();
      for (let i = 0; i < codes.length; i += CHUNK) {
        const { data } = await supabase.from("customers").select("id, customer_code").eq("organization_id", ctx.org.id).in("customer_code", codes.slice(i, i + CHUNK));
        for (const c of data ?? []) byCode.set(c.customer_code, c.id);
      }
      const resolved = rows.filter((r) => {
        if (byCode.has(r.customer_code)) return true;
        errors.push({ row: r.row, column: "顧客番号", message: "登録されていない顧客番号です" });
        summary.skipped++;
        return false;
      });

      if (kind === "visits") {
        const vRows = resolved as ReturnType<typeof validateVisitCsv>["rows"];
        const ids = [...new Set(vRows.map((r) => byCode.get(r.customer_code)!))];
        const existingKeys = new Set<string>();
        for (let i = 0; i < ids.length; i += CHUNK) {
          const { data } = await supabase.from("visits").select("customer_id, visited_on").in("customer_id", ids.slice(i, i + CHUNK));
          for (const v of data ?? []) existingKeys.add(`${v.customer_id}|${v.visited_on}`);
        }
        const fresh = vRows.filter((r) => {
          const dup = existingKeys.has(`${byCode.get(r.customer_code)}|${r.visited_on}`);
          if (dup) summary.skipped++;
          return !dup;
        });
        for (let i = 0; i < fresh.length; i += CHUNK) {
          const { data, error } = await supabase
            .from("visits")
            .insert(
              fresh.slice(i, i + CHUNK).map((r) => ({
                organization_id: ctx.org.id,
                store_id: r.store_id,
                customer_id: byCode.get(r.customer_code)!,
                visited_on: r.visited_on,
                menu_label: r.menu_label,
                source: "csv" as const,
              })),
            )
            .select("id");
          throwIfDbError(error);
          summary.inserted += data?.length ?? 0;
        }
      } else {
        const aRows = resolved as ReturnType<typeof validateAppointmentCsv>["rows"];
        for (let i = 0; i < aRows.length; i += CHUNK) {
          const { data, error } = await supabase
            .from("appointments")
            .insert(
              aRows.slice(i, i + CHUNK).map((r) => ({
                organization_id: ctx.org.id,
                store_id: r.store_id,
                customer_id: byCode.get(r.customer_code)!,
                scheduled_at: r.scheduled_at,
                status: r.status,
                source: "csv" as const,
              })),
            )
            .select("id");
          throwIfDbError(error);
          summary.inserted += data?.length ?? 0;
        }
      }
    }

    summary.imported = true;
    await supabase.from("import_jobs").insert({
      organization_id: ctx.org.id,
      store_id: defaultStoreId,
      kind,
      status: "completed",
      file_name: file.name.slice(0, 200),
      total_rows: summary.total,
      inserted_rows: summary.inserted,
      updated_rows: summary.updated,
      error_rows: summary.invalid + summary.skipped,
      errors: errors.slice(0, 500),
    });
    revalidatePath(`/o/${ctx.org.slug}/customers`);
    return { ok: true, message: "取り込みが完了しました", summary, errors } as ImportState;
  });
  return result as ImportState;
}
