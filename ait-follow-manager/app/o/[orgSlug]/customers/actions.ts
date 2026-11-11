"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertCan, getOrgContext, type OrgContext } from "@/lib/auth/context";
import { createClient, type DbClient } from "@/lib/db/server";
import { formString, runAction, throwIfDbError, UserFacingError, type ActionState } from "@/lib/actions";
import { isIsoDate, todayInTimeZone } from "@/lib/dates";

const noFormula = (v: string) => !/^[=+\-@]/.test(v);
const name = (max: number) => z.string().max(max, `${max}文字以内で入力してください`).refine(noFormula, "先頭に = + - @ は使用できません");

const customerSchema = z.object({
  storeId: z.uuid("店舗を選択してください"),
  customerCode: z.string().regex(/^[A-Za-z0-9_-]{0,30}$/, "顧客番号は半角英数字・ハイフン・アンダースコア（30文字以内）"),
  familyName: name(50).min(1, "姓を入力してください"),
  givenName: name(50),
  familyNameKana: name(50),
  givenNameKana: name(50),
  phone: z.string().regex(/^$|^[0-9+][0-9+() -]{0,19}$/, "電話番号の形式が正しくありません"),
  email: z.string().max(254).regex(/^$|^[^@\s]+@[^@\s]+\.[^@\s]+$/, "メールアドレスの形式が正しくありません"),
  assignedStaffId: z.union([z.literal(""), z.uuid()]),
});

function parseCustomer(fd: FormData) {
  return customerSchema.parse({
    storeId: formString(fd, "storeId"),
    customerCode: formString(fd, "customerCode"),
    familyName: formString(fd, "familyName"),
    givenName: formString(fd, "givenName"),
    familyNameKana: formString(fd, "familyNameKana"),
    givenNameKana: formString(fd, "givenNameKana"),
    phone: formString(fd, "phone"),
    email: formString(fd, "email"),
    assignedStaffId: formString(fd, "assignedStaffId"),
  });
}

/** 顧客を取得し、店舗に対する権限を検証する（クライアント送信の店舗 ID は信用しない） */
async function loadCustomer(ctx: OrgContext, supabase: DbClient, customerId: string) {
  const { data } = await supabase
    .from("customers")
    .select("id, store_id, organization_id")
    .eq("id", z.uuid().parse(customerId))
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!data) throw new UserFacingError("顧客が見つかりません");
  return data;
}

export async function createCustomer(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(formString(fd, "orgSlug"));
    const input = parseCustomer(fd);
    assertCan(ctx, "customer.write", input.storeId);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("customers")
      .insert({
        organization_id: ctx.org.id,
        store_id: input.storeId,
        customer_code: input.customerCode,
        family_name: input.familyName,
        given_name: input.givenName,
        family_name_kana: input.familyNameKana,
        given_name_kana: input.givenNameKana,
        phone: input.phone || null,
        email: input.email || null,
        assigned_staff_id: input.assignedStaffId || null,
      })
      .select("id")
      .single();
    throwIfDbError(error);

    const consent = formString(fd, "consent");
    if (consent === "granted" || consent === "not_allowed" || consent === "unsubscribed") {
      await supabase.from("consent_records").insert({
        organization_id: ctx.org.id,
        customer_id: data!.id,
        status: consent,
        source: "in_store_form",
        recorded_by: ctx.userId,
      });
    }
    redirect(`/o/${ctx.org.slug}/customers/${data!.id}`);
  });
}

export async function updateCustomer(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(formString(fd, "orgSlug"));
    const supabase = await createClient();
    const current = await loadCustomer(ctx, supabase, formString(fd, "customerId"));
    const input = parseCustomer(fd);
    assertCan(ctx, "customer.write", current.store_id);
    assertCan(ctx, "customer.write", input.storeId);
    const { error } = await supabase
      .from("customers")
      .update({
        store_id: input.storeId,
        customer_code: input.customerCode || undefined,
        family_name: input.familyName,
        given_name: input.givenName,
        family_name_kana: input.familyNameKana,
        given_name_kana: input.givenNameKana,
        phone: input.phone || null,
        email: input.email || null,
        assigned_staff_id: input.assignedStaffId || null,
      })
      .eq("id", current.id);
    throwIfDbError(error);
    redirect(`/o/${ctx.org.slug}/customers/${current.id}`);
  });
}

async function withCustomer(fd: FormData, permission: "consent.record" | "visit.record" | "customer.write") {
  const ctx = await getOrgContext(formString(fd, "orgSlug"));
  const supabase = await createClient();
  const customer = await loadCustomer(ctx, supabase, formString(fd, "customerId"));
  assertCan(ctx, permission, customer.store_id);
  return { ctx, supabase, customer };
}

function done(ctx: OrgContext, customerId: string, message: string): ActionState {
  revalidatePath(`/o/${ctx.org.slug}/customers/${customerId}`);
  return { ok: true, message };
}

export async function recordConsent(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx, supabase, customer } = await withCustomer(fd, "consent.record");
    const input = z
      .object({
        status: z.enum(["granted", "not_allowed", "unsubscribed"], { message: "状態を選択してください" }),
        source: z.enum(["in_store_form", "verbal", "customer_request", "other"]),
        note: z.string().max(200),
      })
      .parse({ status: formString(fd, "status"), source: formString(fd, "source") || "verbal", note: formString(fd, "note") });
    const { error } = await supabase.from("consent_records").insert({
      organization_id: ctx.org.id,
      customer_id: customer.id,
      channel: "all",
      status: input.status,
      source: input.source,
      note: input.note || null,
      recorded_by: ctx.userId,
    });
    throwIfDbError(error);
    return done(ctx, customer.id, input.status === "granted" ? "連絡同意を記録しました" : "連絡不可・配信停止を記録しました。未対応の連絡タスクは対象外になりました");
  });
}

export async function addVisit(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx, supabase, customer } = await withCustomer(fd, "visit.record");
    const today = todayInTimeZone(ctx.org.timezone);
    const input = z
      .object({
        visitedOn: z.string().refine(isIsoDate, "来店日を入力してください").refine((d) => d <= today, "未来の日付は登録できません"),
        menuLabel: z.string().max(100).refine(noFormula, "先頭に = + - @ は使用できません"),
      })
      .parse({ visitedOn: formString(fd, "visitedOn"), menuLabel: formString(fd, "menuLabel") });
    const { error } = await supabase.from("visits").insert({
      organization_id: ctx.org.id,
      store_id: customer.store_id,
      customer_id: customer.id,
      visited_on: input.visitedOn,
      menu_label: input.menuLabel || null,
      staff_id: ctx.userId,
    });
    throwIfDbError(error);
    return done(ctx, customer.id, "来店を記録しました");
  });
}

export async function deleteVisit(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx, supabase, customer } = await withCustomer(fd, "visit.record");
    assertCan(ctx, "store.update", customer.store_id);
    const { error, count } = await supabase
      .from("visits")
      .delete({ count: "exact" })
      .eq("id", z.uuid().parse(formString(fd, "visitId")))
      .eq("customer_id", customer.id);
    throwIfDbError(error);
    if (!count) throw new UserFacingError("削除できませんでした");
    return done(ctx, customer.id, "来店記録を削除しました");
  });
}

export async function addAppointment(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx, supabase, customer } = await withCustomer(fd, "visit.record");
    const input = z
      .object({
        scheduledAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "予約日時を入力してください"),
        status: z.enum(["scheduled", "confirmed"]),
        note: z.string().max(200),
      })
      .parse({ scheduledAt: formString(fd, "scheduledAt"), status: formString(fd, "status") || "scheduled", note: formString(fd, "note") });
    const { error } = await supabase.from("appointments").insert({
      organization_id: ctx.org.id,
      store_id: customer.store_id,
      customer_id: customer.id,
      // 入力は日本時間の壁時計時刻
      scheduled_at: `${input.scheduledAt}:00+09:00`,
      status: input.status,
      note: input.note || null,
    });
    throwIfDbError(error);
    return done(ctx, customer.id, "予約を登録しました");
  });
}

export async function updateAppointmentStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx, supabase, customer } = await withCustomer(fd, "visit.record");
    const status = z.enum(["scheduled", "confirmed", "cancelled", "completed", "no_show"]).parse(formString(fd, "status"));
    const { error } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", z.uuid().parse(formString(fd, "appointmentId")))
      .eq("customer_id", customer.id);
    throwIfDbError(error);
    return done(ctx, customer.id, "予約の状態を更新しました");
  });
}

export async function addNote(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx, supabase, customer } = await withCustomer(fd, "customer.write");
    const body = z.string().min(1, "メモを入力してください").max(2000).parse(formString(fd, "body"));
    const { error } = await supabase
      .from("customer_notes")
      .insert({ organization_id: ctx.org.id, customer_id: customer.id, body, author_id: ctx.userId });
    throwIfDbError(error);
    return done(ctx, customer.id, "メモを追加しました");
  });
}

export async function setTags(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx, supabase, customer } = await withCustomer(fd, "customer.write");
    const wanted = new Set(fd.getAll("tagIds").map((v) => z.uuid().parse(String(v))));
    const newTag = formString(fd, "newTag");
    if (newTag) {
      const tagName = z.string().max(30).refine(noFormula).parse(newTag);
      const { data: existing } = await supabase.from("tags").select("id").eq("organization_id", ctx.org.id).eq("name", tagName).maybeSingle();
      if (existing) {
        wanted.add(existing.id);
      } else {
        const { data, error } = await supabase.from("tags").insert({ organization_id: ctx.org.id, name: tagName }).select("id").single();
        throwIfDbError(error);
        wanted.add(data!.id);
      }
    }
    const { data: current } = await supabase.from("customer_tags").select("tag_id").eq("customer_id", customer.id);
    const have = new Set((current ?? []).map((t) => t.tag_id));
    const add = [...wanted].filter((id) => !have.has(id));
    const remove = [...have].filter((id) => !wanted.has(id));
    if (add.length) {
      throwIfDbError((await supabase.from("customer_tags").insert(add.map((tag_id) => ({ organization_id: ctx.org.id, customer_id: customer.id, tag_id })))).error);
    }
    if (remove.length) {
      throwIfDbError((await supabase.from("customer_tags").delete().eq("customer_id", customer.id).in("tag_id", remove)).error);
    }
    return done(ctx, customer.id, "タグを更新しました");
  });
}

export async function anonymizeCustomer(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getOrgContext(formString(fd, "orgSlug"));
    assertCan(ctx, "customer.delete", null);
    if (formString(fd, "confirm") !== "削除") throw new UserFacingError("確認のため「削除」と入力してください");
    const supabase = await createClient();
    const customer = await loadCustomer(ctx, supabase, formString(fd, "customerId"));
    throwIfDbError((await supabase.rpc("anonymize_customer", { p_customer: customer.id })).error);
    redirect(`/o/${ctx.org.slug}/customers?deleted=1`);
  });
}
