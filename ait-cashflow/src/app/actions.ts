"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { appMode } from "@/lib/config";
import type { Role } from "@/lib/cash/types";
import { getRepo, ORG_COOKIE, requireOrg, requireUser } from "@/lib/data";
import { resetDemo } from "@/lib/data/demo";
import { RepoError, type OrgData, type Repo } from "@/lib/data/repo";
import { rateLimit } from "@/lib/rate-limit";
import {
  accountSchema,
  branchSchema,
  confirmSchema,
  idSchema,
  memberRoleSchema,
  memberSchema,
  orgSchema,
  orgSettingsSchema,
  ruleSchema,
  snapshotSchema,
  transactionSchema,
  transferSchema,
} from "@/lib/validation";
import { isValidDate } from "@/lib/cash/dates";

/**
 * 画面からの更新はすべてここを通す：
 * ログイン確認 → 企業のメンバーか・権限の確認 → レート制限 → 入力の検証（Zod）→ 保存 → 画面の再計算
 * Supabase では DB の RLS でも同じ権限を確かめる（二重の防御）。
 */

export type ActionResult = { ok: boolean; message: string } | null;

const ok = (message: string): ActionResult => ({ ok: true, message });
const ng = (message: string): ActionResult => ({ ok: false, message });

function form(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$")) o[k] = v;
  return o;
}

function firstIssue(e: z.ZodError) {
  return e.issues[0]?.message ?? "入力内容が正しくありません";
}

async function withOrg(
  roles: Role[],
  fn: (ctx: { repo: Repo; data: OrgData; userId: string }) => Promise<ActionResult>,
): Promise<ActionResult> {
  const { repo, user, data } = await requireOrg();
  if (!roles.includes(data.role)) return ng("この操作を行う権限がありません");
  if (!rateLimit(`write:${user.id}`, 60, 60_000)) return ng("操作が多すぎます。1分ほど待ってからもう一度お試しください");
  try {
    const r = await fn({ repo, data, userId: user.id });
    revalidatePath("/", "layout");
    return r;
  } catch (e) {
    if (e instanceof RepoError) return ng(e.message);
    console.error("[action] unexpected error", (e as Error).name);
    return ng("保存できませんでした。時間をおいてもう一度お試しください");
  }
}

const WRITERS: Role[] = ["owner", "accountant"];
const OWNER: Role[] = ["owner"];

// ---- 企業 ----

export async function selectOrgAction(fd: FormData) {
  const { repo } = await requireUser();
  const id = String(fd.get("organization_id") ?? "");
  const list = await repo.memberships();
  if (list.some((m) => m.organization.id === id)) {
    (await cookies()).set(ORG_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 180 });
  }
  revalidatePath("/", "layout");
}

export async function createOrgAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { repo, user } = await requireUser();
  if (!rateLimit(`org:${user.id}`, 5, 60 * 60_000)) return ng("企業の作成が多すぎます。しばらく待ってからお試しください");
  const p = orgSchema.safeParse(form(fd));
  if (!p.success) return ng(firstIssue(p.error));
  try {
    const id = await repo.createOrganization(p.data.name);
    (await cookies()).set(ORG_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 180 });
  } catch (e) {
    return ng(e instanceof RepoError ? e.message : "企業を作成できませんでした");
  }
  redirect("/settings?created=1");
}

export async function updateOrgAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return withOrg(OWNER, async ({ repo, data }) => {
    const p = orgSettingsSchema.safeParse(form(fd));
    if (!p.success) return ng(firstIssue(p.error));
    await repo.updateOrganization(data.organization.id, p.data);
    return ok("企業の設定を保存しました");
  });
}

// ---- 店舗・口座・残高 ----

export async function saveBranchAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return withOrg(WRITERS, async ({ repo, data }) => {
    const p = branchSchema.safeParse(form(fd));
    if (!p.success) return ng(firstIssue(p.error));
    await repo.saveBranch(data.organization.id, p.data);
    return ok(p.data.id ? "店舗を更新しました" : "店舗を追加しました");
  });
}

export async function saveAccountAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return withOrg(WRITERS, async ({ repo, data }) => {
    const p = accountSchema.safeParse(form(fd));
    if (!p.success) return ng(firstIssue(p.error));
    await repo.saveAccount(data.organization.id, p.data);
    return ok(p.data.id ? "口座を更新しました" : "口座を追加しました。基準残高を登録してください");
  });
}

export async function saveSnapshotAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return withOrg(WRITERS, async ({ repo, data }) => {
    const p = snapshotSchema.safeParse(form(fd));
    if (!p.success) return ng(firstIssue(p.error));
    if (!data.accounts.some((a) => a.id === p.data.bank_account_id)) return ng("口座が見つかりません");
    await repo.saveSnapshot(data.organization.id, p.data);
    return ok("基準残高を登録しました");
  });
}

// ---- 取引 ----

export async function createTransactionAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return withOrg(WRITERS, async ({ repo, data }) => {
    const f = form(fd);
    if (f.direction === "transfer") {
      const p = transferSchema.safeParse(f);
      if (!p.success) return ng(firstIssue(p.error));
      await repo.createTransfer(data.organization.id, p.data);
      return ok("口座間振替を登録しました（企業全体の残高は変わりません）");
    }
    const p = transactionSchema.safeParse(f);
    if (!p.success) return ng(firstIssue(p.error));
    if (!data.accounts.some((a) => a.id === p.data.bank_account_id)) return ng("口座が見つかりません");
    await repo.createTransaction(data.organization.id, p.data);
    return ok(p.data.status === "planned" ? "予定を登録しました" : "確定した取引を登録しました");
  });
}

/** 確定・取消のあとは行が一覧から消えるので、一覧の上に結果を出す */
function backToList(fd: FormData, done: "confirmed" | "canceled"): never {
  const status = String(fd.get("return_status") ?? "planned");
  redirect(`/transactions?status=${/^[a-z]+$/.test(status) ? status : "planned"}&done=${done}`);
}

export async function confirmTransactionAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await withOrg(WRITERS, async ({ repo, data }) => {
    const p = confirmSchema.safeParse(form(fd));
    if (!p.success) return ng(firstIssue(p.error));
    await repo.confirmTransaction(data.organization.id, p.data.id, p.data.confirmed_date, p.data.amount_jpy);
    return ok("確定にしました（予定と実績は同じ1件として数えます）");
  });
  if (r?.ok) backToList(fd, "confirmed");
  return r;
}

export async function cancelTransactionAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await withOrg(WRITERS, async ({ repo, data }) => {
    const p = idSchema.safeParse(form(fd));
    if (!p.success) return ng(firstIssue(p.error));
    await repo.cancelTransaction(data.organization.id, p.data.id);
    return ok("取り消しました（計算に含めません。記録は残ります）");
  });
  if (r?.ok) backToList(fd, "canceled");
  return r;
}

export async function confirmOccurrenceAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await withOrg(WRITERS, async ({ repo, data }) => {
    const f = form(fd);
    if (!isValidDate(f.occurrence_date ?? "") || !isValidDate(f.planned_date ?? "")) return ng("日付が正しくありません");
    const p = confirmSchema.safeParse({ id: f.rule_id, confirmed_date: f.confirmed_date, amount_jpy: f.amount_jpy });
    if (!p.success) return ng(firstIssue(p.error));
    await repo.materializeOccurrence(data.organization.id, p.data.id, f.occurrence_date, f.planned_date, { date: p.data.confirmed_date, amount: p.data.amount_jpy });
    return ok("繰返しの回を確定にしました");
  });
  if (r?.ok) backToList(fd, "confirmed");
  return r;
}

export async function saveRuleAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return withOrg(WRITERS, async ({ repo, data }) => {
    const f = form(fd);
    for (const k of ["day_of_month", "weekday", "month_of_year"]) if (f[k] === "") delete f[k];
    const p = ruleSchema.safeParse(f);
    if (!p.success) return ng(firstIssue(p.error));
    await repo.saveRule(data.organization.id, p.data);
    return ok("繰返し設定を保存しました");
  });
}

export async function toggleRuleAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return withOrg(WRITERS, async ({ repo, data }) => {
    const p = idSchema.safeParse(form(fd));
    if (!p.success) return ng(firstIssue(p.error));
    const active = fd.get("active") === "true";
    await repo.setRuleActive(data.organization.id, p.data.id, active);
    return ok(active ? "繰返しを再開しました" : "繰返しを停止しました（今後の予定に含めません）");
  });
}

// ---- メンバー ----

export async function addMemberAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return withOrg(OWNER, async ({ repo, data }) => {
    const p = memberSchema.safeParse(form(fd));
    if (!p.success) return ng(firstIssue(p.error));
    await repo.addMember(data.organization.id, p.data.email, p.data.role);
    return ok("メンバーを追加しました");
  });
}

export async function setMemberRoleAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return withOrg(OWNER, async ({ repo, data }) => {
    const p = memberRoleSchema.safeParse(form(fd));
    if (!p.success) return ng(firstIssue(p.error));
    await repo.setMemberRole(data.organization.id, p.data.user_id, p.data.role);
    return ok("権限を変更しました");
  });
}

export async function removeMemberAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return withOrg(OWNER, async ({ repo, data }) => {
    const userId = String(fd.get("user_id") ?? "");
    await repo.removeMember(data.organization.id, userId);
    return ok("メンバーを外しました");
  });
}

// ---- 認証（Supabase） ----

export async function signOutAction() {
  if (appMode() === "supabase") {
    const { createSupabaseServer } = await import("@/lib/supabase/server");
    await (await createSupabaseServer()).auth.signOut();
  }
  (await cookies()).delete(ORG_COOKIE);
  redirect("/login");
}

export async function resetDemoAction() {
  if (getRepo().mode !== "demo") return;
  resetDemo();
  revalidatePath("/", "layout");
}

