"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission, ForbiddenError, requireRecentLogin } from "@/server/session";
import { userSchema, assignmentSchema, globalRoleSchema, firstError, formToObject } from "@/lib/validation";
import { generateInitialPassword } from "@/lib/password";
import { friendlyDbError } from "@/lib/db-error";
import { jstToday } from "@/lib/time";
import { back } from "@/server/redirect-with";
import { provisionLogin, undoProvision, type Provisioned } from "@/server/provision";

export type IssueState = {
  error?: string;
  issued?: { name: string; loginId: string; password: string | null; linkedExisting: boolean; userId: string };
};

async function guardState(): Promise<string | null> {
  try { await requirePermission("master.manage"); return null; } catch (e) {
    if (e instanceof ForbiddenError) return e.message;
    throw e;
  }
}
async function guardRedirect(path: string) {
  const err = await guardState();
  if (err) back(path, "err", err);
}

// スタッフ登録＋ID・PASSの発行（POSで使っているIDなら、そのアカウントに紐づける）
export async function registerUser(_prev: IssueState, fd: FormData): Promise<IssueState> {
  await requireRecentLogin("/admin/users/new");
  const denied = await guardState();
  if (denied) return { error: denied };
  const raw = formToObject(fd);
  const parsed = userSchema.safeParse(raw);
  if (!parsed.success) return { error: firstError(parsed.error) };
  const u = parsed.data;
  const storeId = raw.store_id || null;
  const storeRole = raw.store_role || "STAFF";
  if (storeId && !/^[0-9a-f-]{36}$/.test(storeId)) return { error: "店舗の選択が正しくありません" };
  if (!["MANAGER", "STAFF", "PART_TIMER"].includes(storeRole)) return { error: "店舗での役職が正しくありません" };
  const reissueForExisting = raw.reissue === "on";

  let prov: Provisioned;
  try { prov = await provisionLogin(u.login_id, u.name, { reissueExisting: reissueForExisting }); } catch (e) { return { error: (e as Error).message }; }
  const { authId, password, linkedExisting } = prov;

  const supabase = await createClient();
  const { error } = await supabase.rpc("register_user", {
    p_id: authId, p_staff_code: u.staff_code, p_login_id: u.login_id, p_name: u.name, p_name_kana: u.name_kana,
    p_employment_type: u.employment_type, p_hire_date: u.hire_date, p_pos_staff_id: u.pos_staff_id,
    p_must_change_password: password !== null, p_store: storeId, p_store_role: storeRole, p_starts_on: jstToday(),
  });
  if (error) {
    // 今回新しく作ったログインだけ取り消す（POSの既存アカウントは消さない）
    await undoProvision(prov);
    return { error: friendlyDbError(error) };
  }
  revalidatePath("/admin/users");
  return { issued: { name: u.name, loginId: u.login_id, password, linkedExisting, userId: authId } };
}

// PASSの再発行（新しいPASSは画面に1回だけ表示し、保存しない）
export async function reissuePassword(_prev: IssueState, fd: FormData): Promise<IssueState> {
  await requireRecentLogin("/admin/users");
  const denied = await guardState();
  if (denied) return { error: denied };
  const userId = String(fd.get("user_id") ?? "");
  const supabase = await createClient();
  const { data: target } = await supabase.from("users").select("id, name, login_id, status").eq("id", userId).single();
  if (!target) return { error: "スタッフが見つかりません" };
  if (target.status !== "active") return { error: "退職・停止中の人のPASSは再発行できません（先に在籍に戻してください）" };
  const password = generateInitialPassword();
  const { error } = await createAdminClient().auth.admin.updateUserById(userId, { password });
  if (error) return { error: "PASSを再発行できませんでした" };
  const { error: e2 } = await supabase.from("users").update({ must_change_password: true }).eq("id", userId);
  if (e2) return { error: friendlyDbError(e2) };
  return { issued: { name: target.name, loginId: target.login_id, password, linkedExisting: false, userId } };
}

export async function updateProfile(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const path = `/admin/users/${id}`;
  await guardRedirect(path);
  const parsed = userSchema.omit({ login_id: true }).safeParse(formToObject(fd));
  if (!parsed.success) back(path, "err", firstError(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase.from("users").update(parsed.data).eq("id", id);
  if (error) back(path, "err", friendlyDbError(error));
  revalidatePath(path);
  back(path, "ok", "プロフィールを保存しました");
}

// 退職（ログインを止める。POSにも入れなくなる）・在籍に戻す
export async function setStatus(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const path = `/admin/users/${id}`;
  const me = await requirePermission("master.manage").catch((e) => { if (e instanceof ForbiddenError) back(path, "err", e.message); throw e; });
  const to = String(fd.get("status"));
  if (id === me.id) back(path, "err", "自分自身の在籍状態は変更できません");
  const retiredAt = String(fd.get("retired_at") || jstToday());
  if (to === "retired" && !/^\d{4}-\d{2}-\d{2}$/.test(retiredAt)) back(path, "err", "退職日が正しくありません");
  const supabase = await createClient();
  const { error } = await supabase.from("users")
    .update(to === "retired" ? { status: "retired", retired_at: retiredAt } : { status: "active", retired_at: null })
    .eq("id", id);
  if (error) back(path, "err", friendlyDbError(error));
  const { error: e2 } = await createAdminClient().auth.admin.updateUserById(id, { ban_duration: to === "retired" ? "876000h" : "none" });
  if (e2) back(path, "err", "在籍状態は変更しましたが、ログインの停止／再開に失敗しました。もう一度実行してください");
  revalidatePath(path);
  back(path, "ok", to === "retired" ? "退職にしました（ログインを停止しました）" : "在籍に戻しました（ログインできます）");
}

export async function addAssignment(fd: FormData) {
  const id = String(fd.get("user_id") ?? "");
  const path = `/admin/users/${id}`;
  await guardRedirect(path);
  const parsed = assignmentSchema.safeParse(formToObject(fd));
  if (!parsed.success) back(path, "err", firstError(parsed.error));
  const supabase = await createClient();
  const { data: role } = await supabase.from("roles").select("id").eq("code", parsed.data.role).single();
  const { error } = await supabase.from("user_store_assignments").insert({
    id: randomUUID(), user_id: id, store_id: parsed.data.store_id, role_id: role?.id, is_primary: parsed.data.is_primary, starts_on: parsed.data.starts_on,
  });
  if (error) back(path, "err", friendlyDbError(error));
  revalidatePath(path);
  back(path, "ok", "所属を追加しました");
}

export async function endAssignment(fd: FormData) {
  const userId = String(fd.get("user_id") ?? "");
  const path = `/admin/users/${userId}`;
  await guardRedirect(path);
  const endsOn = String(fd.get("ends_on") || jstToday());
  const supabase = await createClient();
  const { error } = await supabase.from("user_store_assignments").update({ ends_on: endsOn, is_primary: false }).eq("id", String(fd.get("id"))).eq("user_id", userId);
  if (error) back(path, "err", friendlyDbError(error));
  revalidatePath(path);
  back(path, "ok", `所属を${endsOn}で終了しました`);
}

export async function addGlobalRole(fd: FormData) {
  const id = String(fd.get("user_id") ?? "");
  const path = `/admin/users/${id}`;
  await guardRedirect(path);
  const parsed = globalRoleSchema.safeParse(formToObject(fd));
  if (!parsed.success) back(path, "err", firstError(parsed.error));
  const supabase = await createClient();
  const { data: role } = await supabase.from("roles").select("id").eq("code", parsed.data.role).single();
  const { error } = await supabase.from("user_roles").insert({ user_id: id, role_id: role?.id, area_id: parsed.data.area_id, starts_on: parsed.data.starts_on });
  if (error) back(path, "err", friendlyDbError(error));
  revalidatePath(path);
  back(path, "ok", "役職を追加しました");
}

export async function endGlobalRole(fd: FormData) {
  const userId = String(fd.get("user_id") ?? "");
  const path = `/admin/users/${userId}`;
  await guardRedirect(path);
  const endsOn = String(fd.get("ends_on") || jstToday());
  const supabase = await createClient();
  const { error } = await supabase.from("user_roles").update({ ends_on: endsOn }).eq("id", String(fd.get("id"))).eq("user_id", userId);
  if (error) back(path, "err", friendlyDbError(error));
  revalidatePath(path);
  back(path, "ok", `役職を${endsOn}で終了しました`);
}
