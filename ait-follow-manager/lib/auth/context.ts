import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/db/server";
import { env } from "@/lib/env";
import { can, highestRole, storesWithPermission, type MembershipLike, type Permission, type Role } from "./permissions";
import { AuthorizationError } from "./errors";

export type OrgSettings = {
  include_unknown_consent: boolean;
  staff_visibility: "store" | "assigned";
};

export type OrgContext = {
  userId: string;
  email: string;
  displayName: string;
  org: { id: string; name: string; slug: string; timezone: string; status: string; settings: OrgSettings };
  memberships: (MembershipLike & { id: string })[];
  role: Role;
  stores: { id: string; name: string; code: string; is_active: boolean }[];
  /** 自分がアクセスできる店舗（org_admin は全店舗） */
  accessibleStoreIds: string[];
};

/** ログイン中のユーザー（未ログインなら null） */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

export const requireUser = cache(async () => {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
});

/** 管理者ロールで MFA（aal2）を要求する */
export const ensureMfaIfRequired = cache(async (isAdmin: boolean) => {
  if (!isAdmin || !env().REQUIRE_ADMIN_MFA) return;
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel !== "aal2") redirect("/mfa");
});

export const isPlatformAdmin = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data } = await supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return Boolean(data);
});

/**
 * URL の orgSlug から組織コンテキストを取得する。所属していなければ 404（存在を推測させない）。
 * クライアントから organization_id を受け取らず、必ずここで得た org.id を使う。
 */
export const getOrgContext = cache(async (orgSlug: string): Promise<OrgContext> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, timezone, status, settings")
    .eq("slug", orgSlug)
    .maybeSingle();
  if (!org) notFound();
  if (org.status !== "active") redirect(`/suspended?org=${encodeURIComponent(org.slug)}`);

  const [{ data: memberships }, { data: profile }, { data: stores }] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, role, store_id")
      .eq("user_id", user.id)
      .eq("organization_id", org.id)
      .eq("status", "active"),
    supabase.from("users").select("display_name, is_active").eq("id", user.id).maybeSingle(),
    supabase.from("stores").select("id, name, code, is_active").eq("organization_id", org.id).order("code"),
  ]);
  if (!memberships?.length || !profile?.is_active) notFound();

  const ms = memberships as (MembershipLike & { id: string })[];
  const role = highestRole(ms)!;
  await ensureMfaIfRequired(role === "org_admin");

  const allStores = stores ?? [];
  const accessibleStoreIds =
    role === "org_admin"
      ? allStores.map((s) => s.id)
      : allStores.filter((s) => ms.some((m) => m.store_id === s.id)).map((s) => s.id);

  const settings = (org.settings ?? {}) as Partial<OrgSettings>;
  return {
    userId: user.id,
    email: user.email ?? "",
    displayName: profile.display_name,
    org: {
      ...org,
      settings: {
        include_unknown_consent: settings.include_unknown_consent === true,
        staff_visibility: settings.staff_visibility === "assigned" ? "assigned" : "store",
      },
    },
    memberships: ms,
    role,
    stores: allStores,
    accessibleStoreIds,
  };
});

export function ctxCan(ctx: OrgContext, permission: Permission, storeId?: string | null) {
  return can(ctx.memberships, permission, storeId);
}

/** 権限がなければ AuthorizationError を投げる（Server Action 用） */
export function assertCan(ctx: OrgContext, permission: Permission, storeId?: string | null) {
  if (!can(ctx.memberships, permission, storeId)) throw new AuthorizationError();
}

export function storeIdsWith(ctx: OrgContext, permission: Permission) {
  return storesWithPermission(ctx.memberships, permission, ctx.accessibleStoreIds);
}

/** ページ用：権限がなければ 404 */
export function requirePermission(ctx: OrgContext, permission: Permission, storeId?: string | null) {
  if (!can(ctx.memberships, permission, storeId)) notFound();
}
