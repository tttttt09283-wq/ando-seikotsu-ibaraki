import { addDays } from "@/lib/cash/dates";
import { accountBalances, accountsInScope, buildForecast, type Scope } from "@/lib/cash/forecast";
import { DEFAULT_SCENARIOS } from "@/lib/cash/scenarios";
import type { ScenarioKind } from "@/lib/cash/types";
import type { OrgData } from "@/lib/data/repo";

/** ダッシュボード・資金予測の画面用にまとめる（計算は lib/cash の検証済みロジックだけを使う） */

export function resolveScope(data: OrgData, param: string | undefined): { scope: Scope; label: string; value: string } {
  const b = data.branches.find((x) => x.id === param);
  return b ? { scope: { kind: "branch", branchId: b.id }, label: b.name, value: b.id } : { scope: { kind: "organization" }, label: "企業全体", value: "all" };
}

export function scopeMinBalance(data: OrgData, scope: Scope) {
  if (scope.kind === "organization") return data.organization.min_balance_jpy;
  return accountsInScope(data.accounts, scope).reduce((n, a) => n + a.min_balance_jpy, 0);
}

export function forecastFor(data: OrgData, today: string, scope: Scope, kind: ScenarioKind, horizonDays = 180) {
  return buildForecast({
    accounts: data.accounts,
    snapshots: data.snapshots,
    transactions: data.transactions,
    rules: data.rules,
    today,
    horizonDays,
    scope,
    assumptions: DEFAULT_SCENARIOS[kind].assumptions,
    minBalance: scopeMinBalance(data, scope),
    staleAfterDays: data.organization.stale_after_days,
  });
}

export function dashboardModel(data: OrgData, today: string, scopeParam: string | undefined) {
  const { scope, label, value } = resolveScope(data, scopeParam);
  const std = forecastFor(data, today, scope, "standard");
  const cons = forecastFor(data, today, scope, "conservative");
  const accounts = accountsInScope(data.accounts, scope);
  const balances = accountBalances({ accounts, snapshots: data.snapshots, transactions: data.transactions, today, staleAfterDays: data.organization.stale_after_days });
  const ids = new Set(accounts.map((a) => a.id));
  const updates = [
    ...data.snapshots.filter((s) => ids.has(s.bank_account_id)).map((s) => s.created_at),
    ...data.transactions.filter((t) => ids.has(t.bank_account_id)).map((t) => t.updated_at),
  ].filter(Boolean);
  const in30 = std.items.filter((i) => !i.internalTransfer && i.date <= addDays(today, 30));
  const sources = new Set(data.snapshots.filter((s) => ids.has(s.bank_account_id)).map((s) => s.source));
  return {
    scope,
    scopeLabel: label,
    scopeValue: value,
    std,
    cons,
    minBalance: std.minBalance,
    balances: balances.map((b) => ({ ...b, account: accounts.find((a) => a.id === b.accountId)! })),
    lastUpdated: updates.sort().at(-1) ?? null,
    sources: [...sources].map((s) => ({ manual: "手入力", csv: "CSV取込", api: "外部連携" })[s]),
    staleAccounts: balances.filter((b) => b.stale),
    totals30: {
      inflow: in30.filter((i) => i.direction === "in").reduce((n, i) => n + i.amount, 0),
      outflow: in30.filter((i) => i.direction === "out").reduce((n, i) => n + i.amount, 0),
    },
    upcoming: std.items.filter((i) => i.date <= addDays(today, 14)),
    chart: std.days.map((d, i) => ({ date: d.date, standard: d.balance, conservative: cons.days[i]?.balance ?? null, inflow: d.inflow, outflow: -d.outflow })),
  };
}
