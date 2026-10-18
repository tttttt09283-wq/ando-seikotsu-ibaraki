"use server";

import { revalidatePath } from "next/cache";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { ROLE_LABELS, canGrantRole, isSuperAdmin } from "@/lib/auth/permissions";
import { toUserMessage, type ActionResult } from "@/lib/errors";
import { todayJst } from "@/lib/time/jst";
import {
  accountCreateSchema,
  accountDisableSchema,
  parseForm,
  passwordResetSchema,
  roleEndSchema,
  roleGrantSchema,
} from "@/lib/validation/schemas";

/**
 * 管理画面アカウントの作成。
 * Supabase Auth のユーザー作成だけ service_role を使い、それ以外（app_accounts・スタッフ紐付け）は
 * 操作者本人の権限で書き込む（RLS・監査ログが操作者で記録される）。
 */
export async function createAccount(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireHq();
  const parsed = parseForm(accountCreateSchema, formData);
  if (!parsed.ok) return parsed;
  const d = parsed.data;

  const admin = createSupabaseAdmin();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: d.email,
    password: d.password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return {
      ok: false,
      message: createError?.message.includes("already") ? "そのメールアドレスは既に登録されています" : "アカウントを作成できませんでした",
    };
  }

  const supabase = await createSupabaseServer();
  const { error: accountError } = await supabase
    .from("app_accounts")
    .insert({ user_id: created.user.id, email: d.email, display_name: d.display_name });
  if (accountError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, message: toUserMessage(accountError) };
  }

  if (d.staff_id) {
    const { data: linked, error: linkError } = await supabase
      .from("staff_profiles")
      .update({ auth_user_id: created.user.id })
      .eq("staff_id", d.staff_id)
      .is("auth_user_id", null)
      .select("staff_id");
    if (linkError || !linked?.length) {
      revalidatePath("/admin/users");
      return {
        ok: false,
        message: `アカウントは作成しましたが、スタッフとの紐付けに失敗しました（${linkError ? toUserMessage(linkError) : "既に別アカウントと紐付いています"}）`,
      };
    }
  }

  revalidatePath("/admin/users");
  return { ok: true, message: `${d.display_name} のアカウントを作成しました。続けてロールを付与してください` };
}

export async function grantRole(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await requireHq();
  const parsed = parseForm(roleGrantSchema, formData);
  if (!parsed.ok) return parsed;
  const d = parsed.data;
  if (!canGrantRole(actor, d.role)) {
    return { ok: false, message: `${ROLE_LABELS[d.role]}ロールはシステム管理者のみ付与できます` };
  }

  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("user_roles").insert({
    user_id: d.user_id,
    role: d.role,
    clinic_id: d.clinic_id,
    valid_from: d.valid_from,
    granted_by: actor.userId,
  });
  if (error) return { ok: false, message: toUserMessage(error) };

  revalidatePath("/admin/users");
  return { ok: true, message: `${ROLE_LABELS[d.role]}ロールを付与しました` };
}

export async function endRole(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await requireHq();
  const parsed = parseForm(roleEndSchema, formData);
  if (!parsed.ok) return parsed;

  const supabase = await createSupabaseServer();
  const { data: grant } = await supabase
    .from("user_roles")
    .select("user_id, role, valid_from")
    .eq("id", parsed.data.role_grant_id)
    .maybeSingle();
  if (!grant) return { ok: false, message: "対象のロールが見つかりません" };
  if (grant.user_id === actor.userId && (grant.role === "super_admin" || grant.role === "hq_admin")) {
    return { ok: false, message: "自分自身の本部・管理者ロールは終了できません（別の管理者に依頼してください）" };
  }
  if (parsed.data.valid_to < grant.valid_from) {
    return { ok: false, message: "終了日は開始日以降にしてください" };
  }

  const { data, error } = await supabase
    .from("user_roles")
    .update({ valid_to: parsed.data.valid_to })
    .eq("id", parsed.data.role_grant_id)
    .select("id");
  if (error) return { ok: false, message: toUserMessage(error) };
  if (!data?.length) return { ok: false, message: "このロールを変更する権限がありません" };

  revalidatePath("/admin/users");
  return { ok: true, message: "ロールの終了日を設定しました" };
}

export async function resetPassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await requireHq();
  const parsed = parseForm(passwordResetSchema, formData);
  if (!parsed.ok) return parsed;

  const target = await assertTargetManageable(actor.userId, isSuperAdmin(actor), parsed.data.user_id);
  if (!target.ok) return target;

  const { error } = await createSupabaseAdmin().auth.admin.updateUserById(parsed.data.user_id, {
    password: parsed.data.password,
  });
  if (error) return { ok: false, message: "パスワードを再設定できませんでした" };
  return { ok: true, message: "パスワードを再設定しました。本人に安全な方法で伝えてください" };
}

export async function setAccountDisabled(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await requireHq();
  const parsed = parseForm(accountDisableSchema, formData);
  if (!parsed.ok) return parsed;
  if (parsed.data.user_id === actor.userId) return { ok: false, message: "自分自身のアカウントは停止できません" };

  const target = await assertTargetManageable(actor.userId, isSuperAdmin(actor), parsed.data.user_id);
  if (!target.ok) return target;

  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("app_accounts")
    .update({ disabled: parsed.data.disabled })
    .eq("user_id", parsed.data.user_id);
  if (error) return { ok: false, message: toUserMessage(error) };

  // ログイン自体も止める（DB 側でも disabled のアカウントはロール無効として扱われる）
  await createSupabaseAdmin().auth.admin.updateUserById(parsed.data.user_id, {
    ban_duration: parsed.data.disabled ? "876000h" : "none",
  });

  revalidatePath("/admin/users");
  return { ok: true, message: parsed.data.disabled ? "アカウントを停止しました" : "アカウントを再開しました" };
}

/**
 * 本部事務は、本部・管理者ロールを持つアカウントのパスワード再設定・停止はできない。
 * （停止は app_accounts の RLS でも同じ規則で拒否される。パスワードは Auth 側の操作のためここで判定する）
 */
async function assertTargetManageable(actorId: string, actorIsSuperAdmin: boolean, targetId: string): Promise<ActionResult> {
  if (actorIsSuperAdmin || actorId === targetId) return { ok: true, message: "" };
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from("user_roles")
    .select("role, valid_to")
    .eq("user_id", targetId)
    .in("role", ["super_admin", "hq_admin"]);
  const privileged = (data ?? []).some((r) => r.valid_to === null || r.valid_to >= todayJst());
  return privileged
    ? { ok: false, message: "本部・管理者アカウントの操作はシステム管理者のみ可能です" }
    : { ok: true, message: "" };
}
