import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ROLES, canManageClinic, isHq, managedClinicIds, type Actor, type Role } from "./permissions";

/**
 * ログイン中ユーザーとロールを取得する（1リクエスト内でキャッシュ）。
 * ロールは DB の my_roles()（有効期間・アカウント停止を考慮済み）から取る。
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const supabase = await createSupabaseServer();
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) return null;

  const [{ data: roles }, { data: account }] = await Promise.all([
    supabase.rpc("my_roles"),
    supabase.from("app_accounts").select("email, display_name, disabled").eq("user_id", userData.user.id).maybeSingle(),
  ]);
  if (!account || account.disabled) return null;

  return {
    userId: userData.user.id,
    email: account.email,
    displayName: account.display_name,
    roles: ((roles ?? []) as { role: string; clinic_id: string | null }[])
      .filter((r): r is { role: Role; clinic_id: string | null } => (ROLES as readonly string[]).includes(r.role))
      .map((r) => ({ role: r.role, clinicId: r.clinic_id })),
  };
});

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) {
    // Auth にはログインできたが、管理画面アカウントが未登録・停止中の場合は理由を表示する
    const supabase = await createSupabaseServer();
    const { data } = await supabase.auth.getUser();
    redirect(data.user ? "/login?error=account" : "/login");
  }
  return actor;
}

export async function requireHq(): Promise<Actor> {
  const actor = await requireActor();
  if (!isHq(actor)) redirect("/forbidden");
  return actor;
}

export async function requireManager(): Promise<Actor> {
  const actor = await requireActor();
  if (!isHq(actor) && managedClinicIds(actor).length === 0) redirect("/forbidden");
  return actor;
}

/** 指定院の運営権限（本部、または担当院の院長） */
export async function requireClinicManager(clinicId: string): Promise<Actor> {
  const actor = await requireActor();
  if (!canManageClinic(actor, clinicId)) redirect("/forbidden");
  return actor;
}
