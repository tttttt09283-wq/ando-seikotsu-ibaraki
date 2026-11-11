"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertCan, getOrgContext, storeIdsWith } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { env } from "@/lib/env";
import { formString, runAction, throwIfDbError, UserFacingError, type ActionState } from "@/lib/actions";
import { generateFollowupTasks } from "@/lib/followup/generate";
import { SKIP_REASON_LABELS, type SkipReason } from "@/lib/followup/types";

const optional = (max: number) => z.string().max(max, `${max}文字以内で入力してください`);

// ---------------- 会社情報・組織設定 ----------------
export async function updateOrganization(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(formString(fd, "orgSlug"));
    assertCan(ctx, "organization.update", null);
    const input = z
      .object({
        name: z.string().min(1, "会社名を入力してください").max(100),
        phone: optional(20),
        address: optional(200),
        contactEmail: z.union([z.literal(""), z.email("メールアドレスの形式が正しくありません")]),
        includeUnknownConsent: z.boolean(),
        staffVisibility: z.enum(["store", "assigned"]),
      })
      .parse({
        name: formString(fd, "name"),
        phone: formString(fd, "phone"),
        address: formString(fd, "address"),
        contactEmail: formString(fd, "contactEmail"),
        includeUnknownConsent: fd.get("includeUnknownConsent") === "on",
        staffVisibility: formString(fd, "staffVisibility"),
      });
    const supabase = await createClient();
    const { error } = await supabase
      .from("organizations")
      .update({
        name: input.name,
        phone: input.phone || null,
        address: input.address || null,
        contact_email: input.contactEmail || null,
        settings: { include_unknown_consent: input.includeUnknownConsent, staff_visibility: input.staffVisibility },
      })
      .eq("id", ctx.org.id);
    throwIfDbError(error);
    await supabase.rpc("log_audit_event", { org: ctx.org.id, p_action: "organization.updated", p_entity_type: "organizations", p_entity_id: ctx.org.id });
    revalidatePath(`/o/${ctx.org.slug}`, "layout");
    return { ok: true, message: "保存しました" };
  });
}

// ---------------- 店舗 ----------------
const storeSchema = z.object({
  name: z.string().min(1, "店舗名を入力してください").max(100),
  code: z.string().regex(/^[A-Za-z0-9_-]{1,20}$/, "店舗コードは半角英数字（20文字以内）"),
  phone: optional(20),
  address: optional(200),
});

function parseStore(fd: FormData) {
  return storeSchema.parse({ name: formString(fd, "name"), code: formString(fd, "code"), phone: formString(fd, "phone"), address: formString(fd, "address") });
}

export async function createStore(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(formString(fd, "orgSlug"));
    assertCan(ctx, "store.create", null);
    const s = parseStore(fd);
    const supabase = await createClient();
    throwIfDbError((await supabase.from("stores").insert({ organization_id: ctx.org.id, name: s.name, code: s.code, phone: s.phone || null, address: s.address || null })).error);
    revalidatePath(`/o/${ctx.org.slug}`, "layout");
    return { ok: true, message: "店舗を追加しました" };
  });
}

export async function updateStore(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(formString(fd, "orgSlug"));
    const storeId = z.uuid().parse(formString(fd, "storeId"));
    assertCan(ctx, "store.update", storeId);
    const s = parseStore(fd);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("stores")
      .update({ name: s.name, code: s.code, phone: s.phone || null, address: s.address || null, is_active: fd.get("isActive") === "on" })
      .eq("id", storeId)
      .eq("organization_id", ctx.org.id)
      .select("id");
    throwIfDbError(error);
    if (!data?.length) throw new UserFacingError("店舗が見つかりません");
    revalidatePath(`/o/${ctx.org.slug}`, "layout");
    return { ok: true, message: "保存しました" };
  });
}

// ---------------- スタッフ ----------------
const inviteSchema = z.object({
  email: z.email("メールアドレスを入力してください").transform((v) => v.toLowerCase()),
  displayName: z.string().min(1, "氏名を入力してください").max(50),
  role: z.enum(["org_admin", "store_manager", "staff"]),
  storeId: z.union([z.literal(""), z.uuid()]),
});

export async function inviteStaff(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(formString(fd, "orgSlug"));
    const input = inviteSchema.parse({
      email: formString(fd, "email"),
      displayName: formString(fd, "displayName"),
      role: formString(fd, "role"),
      storeId: formString(fd, "storeId"),
    });
    if (input.role === "org_admin") {
      assertCan(ctx, "staff.change_role", null);
    } else {
      if (!input.storeId) throw new UserFacingError("所属店舗を選択してください");
      assertCan(ctx, "staff.invite", input.storeId);
      if (input.role === "store_manager") assertCan(ctx, "staff.change_role", null);
    }

    // 招待メールの送信（Supabase Auth）。サービスロールの利用はここに限定
    const admin = createAdminClient();
    const { data: existing } = await admin.from("users").select("id").eq("email", input.email).maybeSingle();
    let userId = existing?.id;
    let invited = false;
    if (!userId) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
        data: { display_name: input.displayName },
        redirectTo: `${env().SITE_URL}/auth/confirm?next=/account/password`,
      });
      if (error || !data.user) throw new UserFacingError("招待メールを送信できませんでした");
      userId = data.user.id;
      invited = true;
    }

    // 所属の追加はログイン中ユーザーの権限で行う（RLS による二重チェック）
    const supabase = await createClient();
    const { error } = await supabase.from("memberships").insert({
      user_id: userId,
      organization_id: ctx.org.id,
      store_id: input.role === "org_admin" ? null : input.storeId,
      role: input.role,
    });
    throwIfDbError(error);
    revalidatePath(`/o/${ctx.org.slug}/settings/staff`);
    return { ok: true, message: invited ? "招待メールを送信しました" : "既存のアカウントを組織に追加しました" };
  });
}

async function loadMembership(fd: FormData) {
  const ctx = await getOrgContext(formString(fd, "orgSlug"));
  const supabase = await createClient();
  const { data: m } = await supabase
    .from("memberships")
    .select("id, user_id, role, store_id, status")
    .eq("id", z.uuid().parse(formString(fd, "membershipId")))
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!m) throw new UserFacingError("スタッフが見つかりません");
  return { ctx, supabase, m };
}

export async function setMembershipStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx, supabase, m } = await loadMembership(fd);
    if (m.user_id === ctx.userId) throw new UserFacingError("自分自身を無効化することはできません");
    if (m.role === "staff") assertCan(ctx, "staff.invite", m.store_id);
    else assertCan(ctx, "staff.change_role", null);
    const status = formString(fd, "status") === "active" ? "active" : "disabled";
    const { data, error } = await supabase.from("memberships").update({ status }).eq("id", m.id).select("id");
    throwIfDbError(error);
    if (!data?.length) throw new UserFacingError("この操作を行う権限がありません");
    revalidatePath(`/o/${ctx.org.slug}/settings/staff`);
    return { ok: true, message: status === "active" ? "有効にしました" : "無効にしました（ログインしても組織のデータは表示されません）" };
  });
}

export async function changeRole(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx, supabase, m } = await loadMembership(fd);
    assertCan(ctx, "staff.change_role", null);
    if (m.user_id === ctx.userId) throw new UserFacingError("自分自身のロールは変更できません");
    const role = z.enum(["store_manager", "staff"]).parse(formString(fd, "role"));
    if (m.role === "org_admin") throw new UserFacingError("組織管理者のロールは、新しい所属を追加してから無効化してください");
    throwIfDbError((await supabase.from("memberships").update({ role }).eq("id", m.id)).error);
    revalidatePath(`/o/${ctx.org.slug}/settings/staff`);
    return { ok: true, message: "ロールを変更しました" };
  });
}

// ---------------- フォロー条件 ----------------
const ruleSchema = z.object({
  name: z.string().min(1, "名前を入力してください").max(60),
  ruleType: z.enum(["days_since_first_visit", "days_since_last_visit", "no_confirmed_next_appointment", "days_since_last_followup"]),
  offsetDays: z.coerce.number().int().min(0).max(730),
  dueInDays: z.coerce.number().int().min(0).max(30),
  maxLookbackDays: z.coerce.number().int().min(0).max(365),
  taskKind: z.enum(["contact", "internal"]),
  priority: z.enum(["high", "normal", "low"]),
  assigneeStrategy: z.enum(["customer_staff", "store_manager", "unassigned"]),
  templateId: z.union([z.literal(""), z.uuid()]),
  storeId: z.union([z.literal(""), z.uuid()]),
  isActive: z.boolean(),
});

function parseRule(fd: FormData) {
  return ruleSchema.parse({
    name: formString(fd, "name"),
    ruleType: formString(fd, "ruleType"),
    offsetDays: formString(fd, "offsetDays"),
    dueInDays: formString(fd, "dueInDays"),
    maxLookbackDays: formString(fd, "maxLookbackDays"),
    taskKind: formString(fd, "taskKind"),
    priority: formString(fd, "priority"),
    assigneeStrategy: formString(fd, "assigneeStrategy"),
    templateId: formString(fd, "templateId"),
    storeId: formString(fd, "storeId"),
    isActive: fd.get("isActive") === "on",
  });
}

const ruleColumns = (r: z.infer<typeof ruleSchema>) => ({
  name: r.name,
  offset_days: r.offsetDays,
  due_in_days: r.dueInDays,
  max_lookback_days: r.maxLookbackDays,
  task_kind: r.taskKind,
  priority: r.priority,
  assignee_strategy: r.assigneeStrategy,
  default_template_id: r.templateId || null,
  is_active: r.isActive,
});

export async function createRule(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(formString(fd, "orgSlug"));
    const r = parseRule(fd);
    assertCan(ctx, "rule.manage", r.storeId || null);
    const supabase = await createClient();
    throwIfDbError(
      (await supabase.from("followup_rules").insert({ organization_id: ctx.org.id, store_id: r.storeId || null, rule_type: r.ruleType, ...ruleColumns(r) })).error,
    );
    revalidatePath(`/o/${ctx.org.slug}/settings/rules`);
    return { ok: true, message: "フォロー条件を追加しました" };
  });
}

export async function updateRule(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(formString(fd, "orgSlug"));
    const supabase = await createClient();
    const { data: rule } = await supabase
      .from("followup_rules")
      .select("id, store_id, rule_type")
      .eq("id", z.uuid().parse(formString(fd, "ruleId")))
      .eq("organization_id", ctx.org.id)
      .maybeSingle();
    if (!rule) throw new UserFacingError("フォロー条件が見つかりません");
    assertCan(ctx, "rule.manage", rule.store_id);
    const r = parseRule(fd);
    throwIfDbError((await supabase.from("followup_rules").update(ruleColumns(r)).eq("id", rule.id)).error);
    revalidatePath(`/o/${ctx.org.slug}/settings/rules`);
    return { ok: true, message: "保存しました（次回の抽出から反映されます）" };
  });
}

function skipSummary(skipped: Partial<Record<SkipReason, number>>) {
  const keys: SkipReason[] = ["contact_not_allowed", "consent_unknown", "has_appointment"];
  return keys
    .filter((k) => skipped[k])
    .map((k) => `${SKIP_REASON_LABELS[k]} ${skipped[k]}件`)
    .join("、");
}

export async function runExtraction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(formString(fd, "orgSlug"));
    assertCan(ctx, "rule.run");
    const dryRun = formString(fd, "mode") === "preview";
    const storeIds = ctx.role === "org_admin" ? undefined : storeIdsWith(ctx, "rule.run");
    // 抽出ジョブはサービスロールで実行（権限は上で検証済み・対象店舗を限定）
    const result = await generateFollowupTasks(createAdminClient(), { organizationId: ctx.org.id, storeIds, actorUserId: ctx.userId, dryRun });
    const skipped = skipSummary(result.skipped);
    revalidatePath(`/o/${ctx.org.slug}`, "layout");
    return {
      ok: true,
      message: dryRun
        ? `本日の判定：対象 ${result.created}件（既存タスクを含む）${skipped ? `／除外：${skipped}` : ""}`
        : `抽出しました：新規 ${result.created}件、既存 ${result.alreadyExisted}件、条件解消で対象外 ${result.resolved}件${skipped ? `／除外：${skipped}` : ""}`,
    };
  });
}
