import "server-only";
import { randomUUID } from "node:crypto";
import { addDays, clampedDate, todayJst } from "@/lib/cash/dates";
import type { BalanceSnapshot, BankAccount, Branch, CashTransaction, Organization, RecurringRule, Role } from "@/lib/cash/types";
import type { AuditEntry, Member, OrgData, Repo, SessionUser } from "./repo";
import { RepoError } from "./repo";

/**
 * デモモード（Supabase 未設定のときだけ）。すべて架空のデモデータで、サーバーのメモリ上にだけ置く。
 * サーバーを再起動すると最初の状態に戻る。画面には常に「デモデータ」と表示する。
 */

const DEMO_USER: SessionUser = { id: "00000000-0000-4000-8000-0000000000de", email: "demo@example.com" };

type Store = {
  orgs: Organization[];
  members: (Member & { organization_id: string })[];
  branches: Branch[];
  accounts: BankAccount[];
  snapshots: BalanceSnapshot[];
  transactions: CashTransaction[];
  rules: RecurringRule[];
  audit: (AuditEntry & { organization_id: string })[];
};

const g = globalThis as unknown as { __cashflowDemo?: Store };

function seed(today: string): Store {
  const now = new Date().toISOString();
  const org: Organization = { id: randomUUID(), name: "デモ商事株式会社（デモデータ）", min_balance_jpy: 1_000_000, stale_after_days: 7 };
  const o = org.id;
  const shibuya: Branch = { id: randomUUID(), organization_id: o, name: "渋谷店（デモ）", is_active: true, sort_order: 1 };
  const yokohama: Branch = { id: randomUUID(), organization_id: o, name: "横浜店（デモ）", is_active: true, sort_order: 2 };
  const account = (name: string, branch: string | null, kind: BankAccount["kind"], bank: string | null, last4: string | null, sort: number): BankAccount => ({
    id: randomUUID(),
    organization_id: o,
    branch_id: branch,
    name,
    bank_name: bank,
    kind,
    number_last4: last4,
    min_balance_jpy: 0,
    is_active: true,
    sort_order: sort,
  });
  const hq = account("本部 普通預金", null, "bank", "デモ銀行", "1234", 1);
  const shibuyaBank = account("渋谷店 普通預金", shibuya.id, "bank", "デモ信用金庫", "5678", 2);
  const yokohamaBank = account("横浜店 普通預金", yokohama.id, "bank", "デモ信用金庫", "9012", 3);
  const cash = account("渋谷店 レジ現金", shibuya.id, "cash", null, null, 4);
  const yesterday = addDays(today, -1);
  const snap = (a: BankAccount, date: string, amount: number): BalanceSnapshot => ({
    id: randomUUID(),
    organization_id: o,
    bank_account_id: a.id,
    as_of_date: date,
    balance_jpy: amount,
    source: "manual",
    note: "デモデータ",
    created_at: now,
  });
  const tx = (p: Partial<CashTransaction> & Pick<CashTransaction, "bank_account_id" | "direction" | "category" | "amount_jpy">): CashTransaction => ({
    id: randomUUID(),
    organization_id: o,
    branch_id: null,
    planned_date: null,
    confirmed_date: null,
    status: "planned",
    certainty: "fixed",
    counterparty: null,
    memo: "デモデータ",
    transfer_group_id: null,
    recurring_rule_id: null,
    occurrence_date: null,
    created_at: now,
    updated_at: now,
    ...p,
  });
  const [y, m] = today.split("-").map(Number);
  const monthEnd = clampedDate(y, m, 31);
  const transfer = randomUUID();
  const rule = (p: Partial<RecurringRule> & Pick<RecurringRule, "bank_account_id" | "direction" | "category" | "amount_jpy" | "frequency">): RecurringRule => ({
    id: randomUUID(),
    organization_id: o,
    branch_id: null,
    certainty: "fixed",
    counterparty: null,
    memo: "デモデータ",
    interval_count: 1,
    day_of_month: null,
    weekday: null,
    month_of_year: null,
    start_date: clampedDate(y, 1, 1),
    end_date: null,
    weekend_shift: "previous",
    is_active: true,
    ...p,
  });
  return {
    orgs: [org],
    members: [
      { organization_id: o, user_id: DEMO_USER.id, email: DEMO_USER.email, role: "owner" },
      { organization_id: o, user_id: randomUUID(), email: "keiri@example.com", role: "accountant" },
    ],
    branches: [shibuya, yokohama],
    accounts: [hq, shibuyaBank, yokohamaBank, cash],
    snapshots: [snap(hq, yesterday, 3_200_000), snap(shibuyaBank, yesterday, 850_000), snap(yokohamaBank, yesterday, 620_000), snap(cash, addDays(today, -10), 80_000)],
    transactions: [
      tx({ bank_account_id: shibuyaBank.id, branch_id: shibuya.id, direction: "in", category: "sales", amount_jpy: 128_400, status: "confirmed", confirmed_date: today, counterparty: "カード決済の入金（デモ）" }),
      tx({ bank_account_id: yokohamaBank.id, branch_id: yokohama.id, direction: "in", category: "receivable", amount_jpy: 180_000, planned_date: addDays(today, -3), counterparty: "株式会社サンプル（デモ）", memo: "期日超過・未入金" }),
      tx({ bank_account_id: yokohamaBank.id, branch_id: yokohama.id, direction: "in", category: "receivable", amount_jpy: 450_000, planned_date: addDays(today, 5), counterparty: "合同会社テスト（デモ）" }),
      tx({ bank_account_id: shibuyaBank.id, branch_id: shibuya.id, direction: "in", category: "sales", certainty: "expected", amount_jpy: 1_200_000, planned_date: addDays(today, 12), memo: "イベント売上の見込み（デモ）" }),
      tx({ bank_account_id: hq.id, direction: "out", category: "purchase", amount_jpy: 380_000, planned_date: addDays(today, 8), counterparty: "仕入先A（デモ）" }),
      tx({ bank_account_id: hq.id, direction: "out", category: "tax", amount_jpy: 680_000, planned_date: addDays(today, 24), memo: "消費税（中間）（デモ）" }),
      tx({ bank_account_id: hq.id, direction: "out", category: "social_insurance", amount_jpy: 214_000, planned_date: monthEnd, memo: "社会保険料（デモ）" }),
      tx({ bank_account_id: hq.id, direction: "out", category: "transfer", amount_jpy: 500_000, planned_date: addDays(today, 2), transfer_group_id: transfer, memo: "横浜店へ資金移動（デモ）" }),
      tx({ bank_account_id: yokohamaBank.id, direction: "in", category: "transfer", amount_jpy: 500_000, planned_date: addDays(today, 2), transfer_group_id: transfer, memo: "本部から資金移動（デモ）" }),
    ],
    rules: [
      rule({ bank_account_id: hq.id, direction: "out", category: "payroll", amount_jpy: 1_450_000, frequency: "monthly", day_of_month: 25, counterparty: "給与（デモ）" }),
      rule({ bank_account_id: shibuyaBank.id, branch_id: shibuya.id, direction: "out", category: "rent", amount_jpy: 280_000, frequency: "monthly", day_of_month: 31, counterparty: "渋谷店 家賃（デモ）" }),
      rule({ bank_account_id: yokohamaBank.id, branch_id: yokohama.id, direction: "out", category: "rent", amount_jpy: 220_000, frequency: "monthly", day_of_month: 27, counterparty: "横浜店 家賃（デモ）" }),
      rule({ bank_account_id: hq.id, direction: "out", category: "loan_principal", amount_jpy: 150_000, frequency: "monthly", day_of_month: 20, counterparty: "デモ銀行 借入（元本）" }),
      rule({ bank_account_id: hq.id, direction: "out", category: "loan_interest", amount_jpy: 12_000, frequency: "monthly", day_of_month: 20, counterparty: "デモ銀行 借入（利息）" }),
      rule({ bank_account_id: shibuyaBank.id, branch_id: shibuya.id, direction: "in", category: "sales", amount_jpy: 420_000, certainty: "expected", frequency: "weekly", weekday: 5, weekend_shift: "none", counterparty: "カード決済の入金（見込み・デモ）" }),
      rule({ bank_account_id: yokohamaBank.id, branch_id: yokohama.id, direction: "in", category: "sales", amount_jpy: 300_000, certainty: "expected", frequency: "weekly", weekday: 2, weekend_shift: "none", counterparty: "カード決済の入金（見込み・デモ）" }),
    ],
    audit: [],
  };
}

function store(): Store {
  g.__cashflowDemo ??= seed(todayJst());
  return g.__cashflowDemo;
}

export function resetDemo() {
  g.__cashflowDemo = seed(todayJst());
}

function audit(s: Store, orgId: string, action: string, table: string, summary: string) {
  s.audit.unshift({ id: randomUUID(), organization_id: orgId, at: new Date().toISOString(), actor: DEMO_USER.email, action, table, summary });
  s.audit.length = Math.min(s.audit.length, 500);
}

function member(s: Store, orgId: string) {
  const m = s.members.find((x) => x.organization_id === orgId && x.user_id === DEMO_USER.id);
  if (!m) throw new RepoError("この企業のメンバーではありません");
  return m;
}

export const demoRepo: Repo = {
  mode: "demo",
  async currentUser() {
    return DEMO_USER;
  },
  async memberships() {
    const s = store();
    return s.members
      .filter((m) => m.user_id === DEMO_USER.id)
      .map((m) => ({ organization: s.orgs.find((o) => o.id === m.organization_id)!, role: m.role }));
  },
  async createOrganization(name) {
    const s = store();
    const org: Organization = { id: randomUUID(), name, min_balance_jpy: 0, stale_after_days: 7 };
    s.orgs.push(org);
    s.members.push({ organization_id: org.id, user_id: DEMO_USER.id, email: DEMO_USER.email, role: "owner" });
    audit(s, org.id, "insert", "organizations", name);
    return org.id;
  },
  async loadOrg(orgId) {
    const s = store();
    const m = s.members.find((x) => x.organization_id === orgId && x.user_id === DEMO_USER.id);
    const organization = s.orgs.find((o) => o.id === orgId);
    if (!m || !organization) return null;
    const by = <T extends { organization_id: string }>(xs: T[]) => xs.filter((x) => x.organization_id === orgId).map((x) => ({ ...x }));
    return {
      organization: { ...organization },
      role: m.role,
      branches: by(s.branches),
      accounts: by(s.accounts),
      snapshots: by(s.snapshots),
      transactions: by(s.transactions),
      rules: by(s.rules),
      members: s.members.filter((x) => x.organization_id === orgId).map(({ user_id, email, role }) => ({ user_id, email, role })),
    } satisfies OrgData;
  },
  async updateOrganization(orgId, patch) {
    const s = store();
    member(s, orgId);
    Object.assign(s.orgs.find((o) => o.id === orgId)!, patch);
    audit(s, orgId, "update", "organizations", patch.name);
  },
  async saveBranch(orgId, b) {
    const s = store();
    member(s, orgId);
    if (s.branches.some((x) => x.organization_id === orgId && x.name === b.name && x.id !== b.id)) throw new RepoError("同じ名前の店舗があります");
    if (b.id) {
      const cur = s.branches.find((x) => x.id === b.id && x.organization_id === orgId);
      if (!cur) throw new RepoError("店舗が見つかりません");
      Object.assign(cur, { name: b.name, is_active: b.is_active });
    } else {
      s.branches.push({ id: randomUUID(), organization_id: orgId, name: b.name, is_active: b.is_active, sort_order: s.branches.length + 1 });
    }
    audit(s, orgId, b.id ? "update" : "insert", "branches", b.name);
  },
  async saveAccount(orgId, a) {
    const s = store();
    member(s, orgId);
    if (a.branch_id && !s.branches.some((x) => x.id === a.branch_id && x.organization_id === orgId)) throw new RepoError("店舗が見つかりません");
    if (s.accounts.some((x) => x.organization_id === orgId && x.name === a.name && x.id !== a.id)) throw new RepoError("同じ名前の口座があります");
    const fields = { name: a.name, bank_name: a.bank_name, kind: a.kind, branch_id: a.branch_id, number_last4: a.number_last4, min_balance_jpy: a.min_balance_jpy, is_active: a.is_active };
    if (a.id) {
      const cur = s.accounts.find((x) => x.id === a.id && x.organization_id === orgId);
      if (!cur) throw new RepoError("口座が見つかりません");
      Object.assign(cur, fields);
    } else {
      s.accounts.push({ id: randomUUID(), organization_id: orgId, sort_order: s.accounts.length + 1, ...fields });
    }
    audit(s, orgId, a.id ? "update" : "insert", "bank_accounts", a.name);
  },
  async saveSnapshot(orgId, v) {
    const s = store();
    member(s, orgId);
    if (!s.accounts.some((x) => x.id === v.bank_account_id && x.organization_id === orgId)) throw new RepoError("口座が見つかりません");
    s.snapshots = s.snapshots.filter((x) => !(x.bank_account_id === v.bank_account_id && x.as_of_date === v.as_of_date));
    s.snapshots.push({ id: randomUUID(), organization_id: orgId, source: "manual", created_at: new Date().toISOString(), ...v });
    audit(s, orgId, "insert", "balance_snapshots", `${v.as_of_date} ${v.balance_jpy}`);
  },
  async createTransaction(orgId, t) {
    const s = store();
    member(s, orgId);
    if (!s.accounts.some((x) => x.id === t.bank_account_id && x.organization_id === orgId)) throw new RepoError("口座が見つかりません");
    const now = new Date().toISOString();
    s.transactions.push({
      id: randomUUID(),
      organization_id: orgId,
      bank_account_id: t.bank_account_id,
      branch_id: t.branch_id,
      direction: t.direction,
      category: t.category as CashTransaction["category"],
      amount_jpy: t.amount_jpy,
      planned_date: t.status === "planned" ? t.date : null,
      confirmed_date: t.status === "confirmed" ? t.date : null,
      status: t.status,
      certainty: t.certainty,
      counterparty: t.counterparty,
      memo: t.memo,
      transfer_group_id: null,
      recurring_rule_id: null,
      occurrence_date: null,
      created_at: now,
      updated_at: now,
    });
    audit(s, orgId, "insert", "cash_transactions", `${t.direction === "in" ? "入金" : "支払"} ${t.amount_jpy}`);
  },
  async createTransfer(orgId, t) {
    const s = store();
    member(s, orgId);
    for (const a of [t.from_account_id, t.to_account_id]) {
      if (!s.accounts.some((x) => x.id === a && x.organization_id === orgId)) throw new RepoError("口座が見つかりません");
    }
    const g = randomUUID();
    const now = new Date().toISOString();
    for (const [acc, dir] of [
      [t.from_account_id, "out"],
      [t.to_account_id, "in"],
    ] as const) {
      s.transactions.push({
        id: randomUUID(),
        organization_id: orgId,
        bank_account_id: acc,
        branch_id: null,
        direction: dir,
        category: "transfer",
        amount_jpy: t.amount_jpy,
        planned_date: t.status === "planned" ? t.date : null,
        confirmed_date: t.status === "confirmed" ? t.date : null,
        status: t.status,
        certainty: "fixed",
        counterparty: null,
        memo: t.memo,
        transfer_group_id: g,
        recurring_rule_id: null,
        occurrence_date: null,
        created_at: now,
        updated_at: now,
      });
    }
    audit(s, orgId, "insert", "cash_transactions", `振替 ${t.amount_jpy}`);
  },
  async confirmTransaction(orgId, id, date, amount) {
    const s = store();
    member(s, orgId);
    const t = s.transactions.find((x) => x.id === id && x.organization_id === orgId);
    if (!t) throw new RepoError("取引が見つかりません");
    if (t.status !== "planned") throw new RepoError("予定の取引だけ確定できます");
    // 振替は両方の口座を一緒に確定する
    const legs = t.transfer_group_id ? s.transactions.filter((x) => x.transfer_group_id === t.transfer_group_id) : [t];
    for (const l of legs) Object.assign(l, { status: "confirmed", confirmed_date: date, amount_jpy: amount, certainty: "fixed", updated_at: new Date().toISOString() });
    audit(s, orgId, "update", "cash_transactions", `確定 ${amount}`);
  },
  async cancelTransaction(orgId, id) {
    const s = store();
    member(s, orgId);
    const t = s.transactions.find((x) => x.id === id && x.organization_id === orgId);
    if (!t) throw new RepoError("取引が見つかりません");
    const legs = t.transfer_group_id ? s.transactions.filter((x) => x.transfer_group_id === t.transfer_group_id) : [t];
    for (const l of legs) Object.assign(l, { status: "canceled", updated_at: new Date().toISOString() });
    audit(s, orgId, "update", "cash_transactions", "取消");
  },
  async materializeOccurrence(orgId, ruleId, occurrenceDate, plannedDate, confirm) {
    const s = store();
    member(s, orgId);
    const r = s.rules.find((x) => x.id === ruleId && x.organization_id === orgId);
    if (!r) throw new RepoError("繰返し設定が見つかりません");
    if (s.transactions.some((x) => x.recurring_rule_id === ruleId && x.occurrence_date === occurrenceDate)) throw new RepoError("この回はすでに登録されています");
    const now = new Date().toISOString();
    s.transactions.push({
      id: randomUUID(),
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
      transfer_group_id: null,
      recurring_rule_id: r.id,
      occurrence_date: occurrenceDate,
      created_at: now,
      updated_at: now,
    });
    audit(s, orgId, "insert", "cash_transactions", `繰返しの回 ${occurrenceDate}`);
  },
  async saveRule(orgId, v) {
    const s = store();
    member(s, orgId);
    if (!s.accounts.some((x) => x.id === v.bank_account_id && x.organization_id === orgId)) throw new RepoError("口座が見つかりません");
    const fields = {
      bank_account_id: v.bank_account_id,
      branch_id: v.branch_id,
      direction: v.direction,
      category: v.category as RecurringRule["category"],
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
    if (v.id) {
      const cur = s.rules.find((x) => x.id === v.id && x.organization_id === orgId);
      if (!cur) throw new RepoError("繰返し設定が見つかりません");
      Object.assign(cur, fields);
    } else {
      s.rules.push({ id: randomUUID(), organization_id: orgId, is_active: true, ...fields });
    }
    audit(s, orgId, v.id ? "update" : "insert", "recurring_rules", `${v.counterparty ?? ""} ${v.amount_jpy}`);
  },
  async setRuleActive(orgId, id, active) {
    const s = store();
    member(s, orgId);
    const r = s.rules.find((x) => x.id === id && x.organization_id === orgId);
    if (!r) throw new RepoError("繰返し設定が見つかりません");
    r.is_active = active;
    audit(s, orgId, "update", "recurring_rules", active ? "再開" : "停止");
  },
  async addMember(orgId, email) {
    void orgId;
    void email;
    throw new RepoError("デモモードではメンバーを追加できません（Supabase の設定後に使えます）");
  },
  async setMemberRole(orgId, userId, role: Role) {
    const s = store();
    if (member(s, orgId).role !== "owner") throw new RepoError("オーナーだけが変更できます");
    const m = s.members.find((x) => x.organization_id === orgId && x.user_id === userId);
    if (!m) throw new RepoError("メンバーが見つかりません");
    if (m.role === "owner" && role !== "owner" && !s.members.some((x) => x.organization_id === orgId && x.role === "owner" && x.user_id !== userId)) {
      throw new RepoError("最後のオーナーは変更できません");
    }
    m.role = role;
    audit(s, orgId, "update", "organization_members", `${m.email} → ${role}`);
  },
  async removeMember(orgId, userId) {
    const s = store();
    if (member(s, orgId).role !== "owner") throw new RepoError("オーナーだけが削除できます");
    const m = s.members.find((x) => x.organization_id === orgId && x.user_id === userId);
    if (!m) throw new RepoError("メンバーが見つかりません");
    if (m.role === "owner" && !s.members.some((x) => x.organization_id === orgId && x.role === "owner" && x.user_id !== userId)) {
      throw new RepoError("最後のオーナーは削除できません");
    }
    s.members = s.members.filter((x) => x !== m);
    audit(s, orgId, "delete", "organization_members", m.email ?? "");
  },
  async auditLog(orgId, limit) {
    return store()
      .audit.filter((a) => a.organization_id === orgId)
      .slice(0, limit)
      .map(({ organization_id: _o, ...a }) => {
        void _o;
        return a;
      });
  },
};
