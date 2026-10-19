import type { BalanceSnapshot, BankAccount, Branch, CashTransaction, Organization, RecurringRule, Role } from "@/lib/cash/types";
import type { AccountInput, RuleInput, TransactionInput, TransferInput } from "@/lib/validation";

export type SessionUser = { id: string; email: string };
export type Member = { user_id: string; email: string | null; role: Role };
export type AuditEntry = { id: string; at: string; actor: string | null; action: string; table: string; summary: string };

/** 1企業分の画面表示に必要なデータ（RLS で許可された範囲だけ） */
export type OrgData = {
  organization: Organization;
  role: Role;
  branches: Branch[];
  accounts: BankAccount[];
  snapshots: BalanceSnapshot[];
  transactions: CashTransaction[];
  rules: RecurringRule[];
  members: Member[];
};

/**
 * データの読み書き。本番は Supabase（利用者のJWT＋RLS）、デモはメモリ上の架空データ。
 * 権限の確認は呼び出し側（Server Action）でも行い、Supabase では DB の RLS でも拒否される。
 */
export interface Repo {
  readonly mode: "supabase" | "demo";
  currentUser(): Promise<SessionUser | null>;
  memberships(): Promise<{ organization: Organization; role: Role }[]>;
  createOrganization(name: string): Promise<string>;
  loadOrg(orgId: string, today: string): Promise<OrgData | null>;
  updateOrganization(orgId: string, patch: Pick<Organization, "name" | "min_balance_jpy" | "stale_after_days">): Promise<void>;
  saveBranch(orgId: string, b: { id: string | null; name: string; is_active: boolean }): Promise<void>;
  saveAccount(orgId: string, a: AccountInput): Promise<void>;
  saveSnapshot(orgId: string, s: { bank_account_id: string; as_of_date: string; balance_jpy: number; note: string | null }): Promise<void>;
  createTransaction(orgId: string, t: TransactionInput): Promise<void>;
  createTransfer(orgId: string, t: TransferInput): Promise<void>;
  /** 予定を確定にする（同じ行を更新する。別の行は作らない） */
  confirmTransaction(orgId: string, id: string, confirmedDate: string, amount: number): Promise<void>;
  cancelTransaction(orgId: string, id: string): Promise<void>;
  /** 繰返しの回を確定（または予定として固定）する */
  materializeOccurrence(orgId: string, ruleId: string, occurrenceDate: string, plannedDate: string, confirm: { date: string; amount: number } | null): Promise<void>;
  saveRule(orgId: string, r: RuleInput): Promise<void>;
  setRuleActive(orgId: string, id: string, active: boolean): Promise<void>;
  addMember(orgId: string, email: string, role: Role): Promise<void>;
  setMemberRole(orgId: string, userId: string, role: Role): Promise<void>;
  removeMember(orgId: string, userId: string): Promise<void>;
  auditLog(orgId: string, limit: number): Promise<AuditEntry[]>;
}

export class RepoError extends Error {}

export function canWrite(role: Role) {
  return role === "owner" || role === "accountant";
}
