"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, ForbiddenError } from "@/server/session";
import { storeSchema, areaSchema, firstError, formToObject } from "@/lib/validation";
import { friendlyDbError } from "@/lib/db-error";
import { back } from "@/server/redirect-with";

const PATH = "/admin/stores";

async function guard() {
  try { await requirePermission("master.manage"); } catch (e) {
    if (e instanceof ForbiddenError) back(PATH, "err", e.message);
    throw e;
  }
}

export async function saveStore(fd: FormData) {
  await guard();
  const id = String(fd.get("id") ?? "");
  const parsed = storeSchema.safeParse(formToObject(fd));
  if (!parsed.success) back(PATH, "err", firstError(parsed.error));
  const supabase = await createClient();
  const { code, ...rest } = parsed.data;
  // 店舗コードは作成後は変えない（ほかのデータの目印になるため）
  const { error } = id
    ? await supabase.from("stores").update(rest).eq("id", id)
    : await supabase.from("stores").insert({ code, ...rest });
  if (error) back(PATH, "err", friendlyDbError(error));
  revalidatePath(PATH);
  back(PATH, "ok", id ? `${rest.name} を更新しました` : `${rest.name} を追加しました`);
}

export async function saveArea(fd: FormData) {
  await guard();
  const id = String(fd.get("id") ?? "");
  const parsed = areaSchema.safeParse(formToObject(fd));
  if (!parsed.success) back(PATH, "err", firstError(parsed.error));
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("areas").update(parsed.data).eq("id", id)
    : await supabase.from("areas").insert(parsed.data);
  if (error) back(PATH, "err", friendlyDbError(error));
  revalidatePath(PATH);
  back(PATH, "ok", `エリア「${parsed.data.name}」を保存しました`);
}
