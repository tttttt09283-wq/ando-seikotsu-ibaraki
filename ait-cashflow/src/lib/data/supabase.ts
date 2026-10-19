import "server-only";
import { randomUUID } from "node:crypto";
import { addDays } from "@/lib/cash/dates";
import type { BalanceSnapshot, BankAccount, Branch, CashTransaction, Organization, RecurringRule, Role } from "@/lib/cash/types";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { AuditEntry, Member, OrgData, Repo } from "./repo";
import { RepoError } from "./repo";

/**
 * 本番：ログイン中の利用者の権限（JWT）で Supabase に接続する。企業ごとの分離は DB の RLS が保証する。
 * エラーの詳細（SQL・値）は画面にもログにも出さず、利用者向けの文に置き換える。
 */

type PgError = { code?: string; message?: string } | null;

function fail(e: PgError, fallback = "保存できませんでした"): never {
  const code = e?.code ?? "";
  const msg = e?.message ?? "";
  // DB の関数・トリガーが出す日本語のメッセージはそのまま見せる
  if (/[ぁ-んァ-ン一-龥]/.test(msg)) throw new RepoError(msg);
  if (code === "23505") throw new RepoError("同じ内容がすでに登録されています");
  if (code === "42501" || /row-level security/.test(msg)) throw new RepoError("この操作を行う権限がありません");
  if (code === "23503") throw new RepoError("関連するデータ（口座・店舗など）が見つかりません");
  if (code === "23514" || code === "22P02") throw new RepoError("入力内容が正しくありません");
  console.error("[supabase] error", code || "unknown");
  throw new RepoError(fallback);
}

const MAX_ROWS = 5000;

export const supabaseRepo: Repo = {
  mode: "supabase",
  async currentUser() {
    const sb = await createSupabaseServer();
    const { data } = await sb.auth.getUser();
    return data.user ? { id: data.user.id, email: data.user.email ?? "" } : null;
  },
  async memberships() {
    const sb = await createSupabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return [];
    const { data, error } = await sb
      .from("organization_members")
      .select("role, organizations(id, name, min_balance_jpy, stale_after_days)")
      .eq("user_id", u.user.id);
    if (error) fail(error, "企業の一覧を読み込めませんでした");
    return (data ?? []).flatMap((r) => {
      const org = r.organizations as unknown as Organization | null;
      return org ? [{ organization: org, role: r.role as Role }] : [];
    });
  },
  async createOrganization(name) {
    const sb = await createSupabaseServer();
    const { data, error } = await sb.rpc("create_organization", { p_name: name });
    if (error) fail(error, "企業を作成できませんでした");
    return data as string;
  },
  async loadOrg(orgId, today) {
    const sb = await createSupabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return null;
    const since = addDays(today, -400);
    const [org, me, branches, accounts, snapshots, planned, confirmed, rules, members] = await Promise.all([
      sb.from("organizations").select("id, name, min_balance_jpy, stale_after_days").eq("id", orgId).maybeSingle(),
      sb.from("organization_members").select("role").eq("organization_id", orgId).eq("user_id", u.user.id).maybeSingle(),
      sb.from("branches").select("id, organization_id, name, is_active, sort_order").eq("organization_id", orgId).order("sort_order"),
      sb.from("bank_accounts").select("id, organization_id, branch_id, name, bank_name, kind, number_last4, min_balance_jpy, is_active, sort_order").eq("organization_id", orgId).order("sort_order"),
      sb.from("balance_snapshots").select("id, organization_id, bank_account_id, as_of_date, balance_jpy, source, note, created_at").eq("organization_id", orgId).gte("as_of_date", since).order("as_of_date", { ascending: false }).limit(MAX_ROWS),
      sb.from("cash_transactions").select("*").eq("organization_id", orgId).eq("status", "planned").limit(MAX_ROWS),
      sb.from("cash_transactions").select("*").eq("organization_id", orgId).neq("status", "planned").gte("updated_at", `${since}T00:00:00+09:00`).limit(MAX_ROWS),
      sb.from("recurring_rules").select("*").eq("organization_id", orgId),
      sb.from("organization_members").select("user_id, email, role").eq("organization_id", orgId),
    ]);
    for (const r of [org, me, branches, accounts, snapshots, planned, confirmed, rules, members]) if (r.error) fail(r.error, "データを読み込めませんでした");
    if (!org.data || !me.data) return null;
    return {
      organization: org.data as Organization,
      role: me.data.role as Role,
      branches: (branches.data ?? []) as Branch[],
      accounts: (accounts.data ?? []) as BankAccount[],
      snapshots: (snapshots.data ?? []) as BalanceSnapshot[],
      transactions: [...(planned.data ?? []), ...(confirmed.data ?? [])] as CashTransaction[],
      rules: (rules.data ?? []) as RecurringRule[],
      members: (members.data ?? []) as Member[],
    } satisfies OrgData;
  },
  async updateOrganization(orgId, patch) {
    const sb = await createSupabaseServer();
    const { error, count } = await sb.from("organizations").update(patch, { count: "exact" }).eq("id", orgId);
    if (error) fail(error);
    if (!count) throw new RepoError("この操作を行う権限がありません");
  },
  async saveBranch(orgId, b) {
    const sb = await createSupabaseServer();
    const { error } = b.id
      ? await sb.from("branches").update({ name: b.name, is_active: b.is_active }).eq("organization_id", orgId).eq("id", b.id)
      : await sb.from("branches").insert({ organization_id: orgId, name: b.name, is_active: b.is_active });
    if (error) fail(error);
  },
  async saveAccount(orgId, a) {
    const sb = await createSupabaseServer();
    const row = { name: a.name, bank_name: a.bank_name, kind: a.kind, branch_id: a.branch_id, number_last4: a.number_last4, min_balance_jpy: a.min_balance_jpy, is_active: a.is_active };
    const { error } = a.id
      ? await sb.from("bank_accounts").update(row).eq("organization_id", orgId).eq("id", a.id)
      : await sb.from("bank_accounts").insert({ organization_id: orgId, ...row });
    if (error) fail(error);
  },
  async saveSnapshot(orgId, s) {
    const sb = await createSupabaseServer();
    const { error } = await sb
      .from("balance_snapshots")
      .upsert({ organization_id: orgId, source: "manual", ...s }, { onConflict: "bank_account_id,as_of_date" });
    if (error) fail(error);
  },
  async createTransaction(orgId, t) {
    const sb = await createSupabaseServer();
    const { error } = await sb.from("cash_transactions").insert({
      organization_id: orgId,
      bank_account_id: t.bank_account_id,
      branch_id: t.branch_id,
      direction: t.direction,
      category: t.category,
      amount_jpy: t.amount_jpy,
      planned_date: t.status === "planned" ? t.date : null,
      confirmed_date: t.status === "confirmed" ? t.date : null,
      status: t.status,
      certainty: t.certainty,
      counterparty: t.counterparty,
      memo: t.memo,
    });
    if (error) fail(error);
  },
  async createTransfer(orgId, t) {
    const sb = await createSupabaseServer();
    const g = randomUUID();
    const leg = (account: string, direction: "in" | "out") => ({
      organization_id: orgId,
      bank_account_id: account,
      direction,
      category: "transfer",
      amount_jpy: t.amount_jpy,
      planned_date: t.status === "planned" ? t.date : null,
      confirmed_date: t.status === "confirmed" ? t.date : null,
      status: t.status,
      memo: t.memo,
      transfer_group_id: g,
    });
    // 2件を1回の INSERT で登録する（振替の整合チェックはトランザクションの最後に行われる）
    const { error } = await sb.from("cash_transactions").insert([leg(t.from_account_id, "out"), leg(t.to_account_id, "in")]);
    if (error) fail(error);
  },
  async confirmTransaction(orgId, id, date, amount) {
    const sb = await createSupabaseServer();
    const { data: t, error: e1 } = await sb.from("cash_transactions").select("id, status, transfer_group_id").eq("organization_id", orgId).eq("id", id).maybeSingle();
    if (e1) fail(e1);
    if (!t) throw new RepoError("取引が見つかりません");
    if (t.status !== "planned") throw new RepoError("予定の取引だけ確定できます");
    const q = sb.from("cash_transactions").update({ status: "confirmed", confirmed_date: date, amount_jpy: amount, certainty: "fixed" }).eq("organization_id", orgId);
    const { error } = t.transfer_group_id ? await q.eq("transfer_group_id", t.transfer_group_id) : await q.eq("id", id);
    if (error) fail(error);
  },
  async cancelTransaction(orgId, id) {
    const sb = await createSupabaseServer();
    const { data: t, error: e1 } = await sb.from("cash_transactions").select("id, transfer_group_id").eq("organization_id", orgId).eq("id", id).maybeSingle();
    if (e1) fail(e1);
    if (!t) throw new RepoError("取引が見つかりません");
    const q = sb.from("cash_transactions").update({ status: "canceled" }).eq("organization_id", orgId);
    const { error } = t.transfer_group_id ? await q.eq("transfer_group_id", t.transfer_group_id) : await q.eq("id", id);
    if (error) fail(error);
  },
  async materializeOccurrence(orgId, ruleId, occurrenceDate, plannedDate, confirm) {
    const sb = await createSupabaseServer();
    const { data: r, error: e1 } = await sb.from("recurring_rules").select("*").eq("organization_id", orgId).eq("id", ruleId).maybeSingle();
    if (e1) fail(e1);
    if (!r) throw new RepoError("繰返し設定が見つかりません");
    const { error } = await sb.from("cash_transactions").insert({
      organization_id: orgId,
      bank_account_id: r.bank_account_id,
      branch_id: r.branch_id,
      direction: r.direction,
      category: r.category,
      amount_jpy: confirm?.amount ?? r.amount_jpy,
      planned_date: plannedDate,
      confirmed_date: confirm?.date ?? null,
      status: confirm ? "confirmed" : "planned",
      certainty: confirm ? "fixed" : r.certainty,
      counterparty: r.counterparty,
      memo: r.memo,
      recurring_rule_id: r.id,
      occurrence_date: occurrenceDate,
    });
    if (error) fail(error);
  },
  async saveRule(orgId, v) {
    const sb = await createSupabaseServer();
    const row = {
      bank_account_id: v.bank_account_id,
      branch_id: v.branch_id,
      direction: v.direction,
      category: v.category,
      amount_jpy: v.amount_jpy,
      certainty: v.certainty,
      counterparty: v.counterparty,
      memo: v.memo,
      frequency: v.frequency,
      interval_count: v.interval_count,
      day_of_month: v.day_of_month ?? null,
      weekday: v.weekday ?? null,
      month_of_year: v.month_of_year ?? null,
      start_date: v.start_date,
      end_date: v.end_date,
      weekend_shift: v.weekend_shift,
    };
    const { error } = v.id
      ? await sb.from("recurring_rules").update(row).eq("organization_id", orgId).eq("id", v.id)
      : await sb.from("recurring_rules").insert({ organization_id: orgId, ...row });
    if (error) fail(error);
  },
  async setRuleActive(orgId, id, active) {
    const sb = await createSupabaseServer();
    const { error } = await sb.from("recurring_rules").update({ is_active: active }).eq("organization_id", orgId).eq("id", id);
    if (error) fail(error);
  },
  async addMember(orgId, email, role) {
    const sb = await createSupabaseServer();
    const { error } = await sb.rpc("add_member_by_email", { p_org: orgId, p_email: email, p_role: role });
    if (error) fail(error, "メンバーを追加できませんでした");
  },
  async setMemberRole(orgId, userId, role) {
    const sb = await createSupabaseServer();
    const { error, count } = await sb.from("organization_members").update({ role }, { count: "exact" }).eq("organization_id", orgId).eq("user_id", userId);
    if (error) fail(error);
    if (!count) throw new RepoError("この操作を行う権限がありません");
  },
  async removeMember(orgId, userId) {
    const sb = await createSupabaseServer();
    const { error, count } = await sb.from("organization_members").delete({ count: "exact" }).eq("organization_id", orgId).eq("user_id", userId);
    if (error) fail(error);
    if (!count) throw new RepoError("この操作を行う権限がありません");
  },
  async auditLog(orgId, limit): Promise<AuditEntry[]> {
    const sb = await createSupabaseServer();
    const [{ data, error }, { data: members }] = await Promise.all([
      sb.from("audit_logs").select("id, created_at, actor_id, action, table_name, record_id").eq("organization_id", orgId).order("id", { ascending: false }).limit(limit),
      sb.from("organization_members").select("user_id, email").eq("organization_id", orgId),
    ]);
    if (error) return [];
    const email = new Map((members ?? []).map((m) => [m.user_id, m.email]));
    return (data ?? []).map((r) => ({
      id: String(r.id),
      at: r.created_at,
      actor: r.actor_id ? (email.get(r.actor_id) ?? "（削除されたユーザー）") : "システム",
      action: r.action,
      table: r.table_name,
      summary: r.record_id ? `ID ${String(r.record_id).slice(0, 8)}…` : "",
    }));
  },
};
