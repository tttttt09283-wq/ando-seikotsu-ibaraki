"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertCan, getOrgContext, type OrgContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/db/server";
import { formString, runAction, throwIfDbError, UserFacingError, type ActionState } from "@/lib/actions";
import { copyName, findUnknownVariables, TEMPLATE_CATEGORIES } from "@/lib/templates";

const schema = z.object({
  name: z.string().min(1, "名前を入力してください").max(60),
  body: z.string().min(1, "本文を入力してください").max(2000, "本文は2000文字以内で入力してください"),
  category: z.enum(Object.keys(TEMPLATE_CATEGORIES) as [keyof typeof TEMPLATE_CATEGORIES]),
  storeId: z.union([z.literal(""), z.uuid()]),
});

function parse(fd: FormData) {
  const input = schema.parse({
    name: formString(fd, "name"),
    body: String(fd.get("body") ?? "").replace(/\r\n/g, "\n").trim(),
    category: formString(fd, "category"),
    storeId: formString(fd, "storeId"),
  });
  const unknown = findUnknownVariables(input.body);
  if (unknown.length) throw new UserFacingError(`使用できない差し込み変数があります：${unknown.map((u) => `{{${u}}}`).join("、")}`);
  return input;
}

export async function createTemplate(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(formString(fd, "orgSlug"));
    const input = parse(fd);
    assertCan(ctx, "template.manage", input.storeId || null);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("message_templates")
      .insert({ organization_id: ctx.org.id, store_id: input.storeId || null, category: input.category, name: input.name, body: input.body })
      .select("id")
      .single();
    throwIfDbError(error);
    redirect(`/o/${ctx.org.slug}/templates/${data!.id}?saved=1`);
  });
}

async function loadTemplate(fd: FormData) {
  const ctx = await getOrgContext(formString(fd, "orgSlug"));
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("message_templates")
    .select("*")
    .eq("id", z.uuid().parse(formString(fd, "templateId")))
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!t) throw new UserFacingError("テンプレートが見つかりません");
  return { ctx, supabase, t };
}

export async function updateTemplate(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx, supabase, t } = await loadTemplate(fd);
    assertCan(ctx, "template.manage", t.store_id);
    const input = parse(fd);
    const { data, error } = await supabase
      .from("message_templates")
      .update({ name: input.name, body: input.body, category: input.category })
      .eq("id", t.id)
      .select("version")
      .single();
    throwIfDbError(error);
    revalidatePath(`/o/${ctx.org.slug}/templates`);
    return { ok: true, message: `保存しました（第${data!.version}版）` };
  });
}

export async function duplicateTemplate(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx, supabase, t } = await loadTemplate(fd);
    // 複製先：管理できる範囲（組織共通を編集できなければ、自分が管理する店舗用として複製）
    const targetStore = ctxCanManage(ctx, t.store_id) ? t.store_id : (ctx.memberships.find((m) => m.role === "store_manager")?.store_id ?? null);
    assertCan(ctx, "template.manage", targetStore);
    const { data, error } = await supabase
      .from("message_templates")
      .insert({ organization_id: ctx.org.id, store_id: targetStore, category: t.category, name: copyName(t.name), body: t.body })
      .select("id")
      .single();
    throwIfDbError(error);
    redirect(`/o/${ctx.org.slug}/templates/${data!.id}?copied=1`);
  });
}

export async function setTemplateArchived(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx, supabase, t } = await loadTemplate(fd);
    assertCan(ctx, "template.manage", t.store_id);
    const archived = formString(fd, "archived") === "true";
    throwIfDbError((await supabase.from("message_templates").update({ is_archived: archived }).eq("id", t.id)).error);
    revalidatePath(`/o/${ctx.org.slug}/templates`);
    return { ok: true, message: archived ? "アーカイブしました" : "元に戻しました" };
  });
}

function ctxCanManage(ctx: OrgContext, storeId: string | null) {
  return can(ctx.memberships, "template.manage", storeId);
}
