"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertCan, getOrgContext } from "@/lib/auth/context";
import { createClient } from "@/lib/db/server";
import { formString, runAction, throwIfDbError, UserFacingError, type ActionState } from "@/lib/actions";
import { isIsoDate } from "@/lib/dates";

const uuid = z.uuid();

async function loadTask(orgSlug: string, taskId: string) {
  const ctx = await getOrgContext(orgSlug);
  const supabase = await createClient();
  const { data: task } = await supabase
    .from("followup_tasks")
    .select("id, store_id, customer_id, organization_id, task_kind")
    .eq("id", uuid.parse(taskId))
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!task) throw new UserFacingError("タスクが見つかりません");
  return { ctx, supabase, task };
}

const recordSchema = z
  .object({
    status: z.enum(["open", "done", "on_hold", "not_applicable"]),
    channel: z.enum(["", "phone", "line_manual", "email_manual", "sms_manual", "in_person", "other"]),
    outcome: z.enum(["", "reached", "no_answer", "sent", "replied", "appointment_reported", "declined", "other"]),
    content: z.string().max(2000, "対応内容は2000文字以内で入力してください"),
    note: z.string().max(1000, "メモは1000文字以内で入力してください"),
    templateId: z.union([z.literal(""), z.uuid()]),
  })
  .refine((v) => v.status !== "not_applicable" || v.note.length > 0, { message: "対象外にする理由を入力してください", path: ["note"] });

export async function recordTaskAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx, supabase, task } = await loadTask(formString(fd, "orgSlug"), formString(fd, "taskId"));
    assertCan(ctx, "task.act", task.store_id);
    const input = recordSchema.parse({
      status: formString(fd, "status"),
      channel: formString(fd, "channel"),
      outcome: formString(fd, "outcome"),
      content: formString(fd, "content"),
      note: formString(fd, "note"),
      templateId: formString(fd, "templateId"),
    });
    if (input.status === "done" && task.task_kind === "contact" && !input.channel) {
      throw new UserFacingError("対応済みにするには連絡手段を選択してください");
    }
    const { error } = await supabase.rpc("record_task_action", {
      p_task: task.id,
      p_status: input.status,
      p_channel: input.channel || undefined,
      p_outcome: input.outcome || undefined,
      p_content: input.content || undefined,
      p_template: input.templateId || undefined,
      p_note: input.note || undefined,
    });
    throwIfDbError(error);
    revalidatePath(`/o/${ctx.org.slug}`, "layout");
    const labels = { open: "未対応に戻しました", done: "対応済みにしました", on_hold: "保留にしました", not_applicable: "対象外にしました" };
    return { ok: true, message: labels[input.status] };
  });
}

export async function assignTask(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx, supabase, task } = await loadTask(formString(fd, "orgSlug"), formString(fd, "taskId"));
    const raw = formString(fd, "assignee");
    const assignee = raw === "me" ? ctx.userId : raw === "" ? null : uuid.parse(raw);
    if (assignee !== ctx.userId) assertCan(ctx, "task.assign_others", task.store_id);
    else assertCan(ctx, "task.act", task.store_id);
    const { error } = await supabase.from("followup_tasks").update({ assigned_to: assignee }).eq("id", task.id);
    throwIfDbError(error);
    revalidatePath(`/o/${ctx.org.slug}/tasks/${task.id}`);
    return { ok: true, message: "担当者を変更しました" };
  });
}

const manualSchema = z.object({
  customerId: z.uuid(),
  title: z.string().min(1, "タスク名を入力してください").max(80),
  dueOn: z.string().refine(isIsoDate, "期限を入力してください"),
  kind: z.enum(["contact", "internal"]),
  priority: z.enum(["high", "normal", "low"]),
});

export async function createManualTask(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(formString(fd, "orgSlug"));
    const input = manualSchema.parse({
      customerId: formString(fd, "customerId"),
      title: formString(fd, "title"),
      dueOn: formString(fd, "dueOn"),
      kind: formString(fd, "kind"),
      priority: formString(fd, "priority"),
    });
    const supabase = await createClient();
    const { data: customer } = await supabase
      .from("customers")
      .select("id, store_id, contact_status, assigned_staff_id")
      .eq("id", input.customerId)
      .eq("organization_id", ctx.org.id)
      .maybeSingle();
    if (!customer) throw new UserFacingError("顧客が見つかりません");
    assertCan(ctx, "task.act", customer.store_id);
    if (input.kind === "contact" && (customer.contact_status === "unsubscribed" || customer.contact_status === "not_allowed")) {
      throw new UserFacingError("配信停止・連絡不可の顧客には連絡タスクを作成できません");
    }
    const { data, error } = await supabase
      .from("followup_tasks")
      .insert({
        organization_id: ctx.org.id,
        store_id: customer.store_id,
        customer_id: customer.id,
        title: input.title,
        due_on: input.dueOn,
        task_kind: input.kind,
        priority: input.priority,
        assigned_to: ctx.userId,
      })
      .select("id")
      .single();
    throwIfDbError(error);
    redirect(`/o/${ctx.org.slug}/tasks/${data!.id}`);
  });
}
