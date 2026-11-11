"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isPlatformAdmin, requireUser } from "@/lib/auth/context";
import { AuthorizationError } from "@/lib/auth/errors";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { env } from "@/lib/env";
import { formString, runAction, throwIfDbError, UserFacingError, type ActionState } from "@/lib/actions";

async function requirePlatform() {
  const user = await requireUser();
  if (!(await isPlatformAdmin())) throw new AuthorizationError();
  return user;
}

export async function createOrganization(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requirePlatform();
    const input = z
      .object({
        name: z.string().min(1, "組織名を入力してください").max(100),
        slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "URL 用 ID は半角小文字・数字・ハイフン（3〜40文字）"),
        storeName: z.string().min(1, "最初の店舗名を入力してください").max(100),
      })
      .parse({ name: formString(fd, "name"), slug: formString(fd, "slug"), storeName: formString(fd, "storeName") });
    const supabase = await createClient();
    const { data: orgId, error } = await supabase.rpc("platform_create_organization", { p_name: input.name, p_slug: input.slug });
    throwIfDbError(error);
    // 最初の店舗（組織の所属者がまだいないためサービスロールで作成）
    const admin = createAdminClient();
    throwIfDbError((await admin.from("stores").insert({ organization_id: orgId!, name: input.storeName, code: "MAIN" })).error);
    revalidatePath("/platform");
    return { ok: true, message: "組織を作成しました。続けて組織管理者を招待してください。" };
  });
}

export async function setOrganizationStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requirePlatform();
    const orgId = z.uuid().parse(formString(fd, "orgId"));
    const status = z.enum(["active", "suspended"]).parse(formString(fd, "status"));
    const supabase = await createClient();
    throwIfDbError((await supabase.rpc("platform_set_organization_status", { p_org: orgId, p_status: status })).error);
    revalidatePath("/platform");
    return { ok: true, message: status === "active" ? "利用を再開しました" : "利用を停止しました" };
  });
}

export async function inviteOrgAdmin(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requirePlatform();
    const input = z
      .object({ orgId: z.uuid(), email: z.email("メールアドレスを入力してください"), displayName: z.string().min(1).max(50) })
      .parse({ orgId: formString(fd, "orgId"), email: formString(fd, "email").toLowerCase(), displayName: formString(fd, "displayName") });
    const admin = createAdminClient();
    const { data: org } = await admin.from("organizations").select("id").eq("id", input.orgId).maybeSingle();
    if (!org) throw new UserFacingError("組織が見つかりません");
    let userId = (await admin.from("users").select("id").eq("email", input.email).maybeSingle()).data?.id;
    if (!userId) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
        data: { display_name: input.displayName },
        redirectTo: `${env().SITE_URL}/auth/confirm?next=/account/password`,
      });
      if (error || !data.user) throw new UserFacingError("招待メールを送信できませんでした");
      userId = data.user.id;
    }
    throwIfDbError((await admin.from("memberships").insert({ user_id: userId, organization_id: org.id, role: "org_admin", created_by: actor.id })).error);
    await admin.from("audit_logs").insert({
      organization_id: null,
      actor_user_id: actor.id,
      action: "platform.org_admin_invited",
      entity_type: "organizations",
      entity_id: org.id,
    });
    revalidatePath("/platform");
    return { ok: true, message: "組織管理者を招待しました" };
  });
}
