import { addDays, daysBetween } from "./dates";
import { expandRule } from "./recurrence";
import type { BalanceSnapshot, BankAccount, CashTransaction, Category, Certainty, Direction, RecurringRule, ScenarioAssumptions } from "./types";

/**
 * 資金繰りの計算（純粋な関数。DB・AI に依存しない）。計算仕様は docs/PLAN.md の「4. 計算仕様」。
 *
 * - 口座の現在残高 = 基準残高（最新の balance_snapshot）＋ 基準日より後・今日までの確定取引
 * - 企業全体 = 有効な口座の現在残高の合計（口座ごとに1回だけ数える）
 * - 予測残高(d) = 予測残高(d−1) ＋ 予定入金(d) − 予定支払(d)
 * - 予定は「同じ行の状態を確定に変える」運用なので、予定と確定は二重に数えない
 * - 繰返しの回は、同じ (rule, occurrence_date) の取引があれば作らない
 * - 振替は口座ごとの残高には反映し、範囲内の口座どうしなら入金・支払の合計には含めない
 */

export type Scope = { kind: "organization" } | { kind: "branch"; branchId: string };

export type AccountBalance = {
  accountId: string;
  /** 基準残高（なければ null ＝残高未登録） */
  base: { date: string; amount: number; source: BalanceSnapshot["source"]; recordedAt: string } | null;
  /** 基準日より後・今日までの確定取引の合計 */
  confirmedAfterBase: number;
  current: number | null;
  /** 基準残高が何日前か */
  ageDays: number | null;
  stale: boolean;
};

export function accountsInScope(accounts: BankAccount[], scope: Scope): BankAccount[] {
  return accounts.filter((a) => a.is_active && (scope.kind === "organization" || a.branch_id === scope.branchId));
}

/** 口座ごとの現在残高（今日の終わり時点。今日までの確定取引を含む） */
export function accountBalances(input: {
  accounts: BankAccount[];
  snapshots: BalanceSnapshot[];
  transactions: CashTransaction[];
  today: string;
  staleAfterDays: number;
}): AccountBalance[] {
  return input.accounts.map((acc) => {
    const snap = input.snapshots
      .filter((s) => s.bank_account_id === acc.id && s.as_of_date <= input.today)
      .sort((a, b) => b.as_of_date.localeCompare(a.as_of_date))[0];
    if (!snap) return { accountId: acc.id, base: null, confirmedAfterBase: 0, current: null, ageDays: null, stale: true };
    let delta = 0;
    for (const t of input.transactions) {
      if (t.bank_account_id !== acc.id || t.status !== "confirmed" || !t.confirmed_date) continue;
      // 基準日以前の確定取引は基準残高に含まれている（二重に足さない）
      if (t.confirmed_date <= snap.as_of_date || t.confirmed_date > input.today) continue;
      delta += t.direction === "in" ? t.amount_jpy : -t.amount_jpy;
    }
    const age = daysBetween(snap.as_of_date, input.today);
    return {
      accountId: acc.id,
      base: { date: snap.as_of_date, amount: snap.balance_jpy, source: snap.source, recordedAt: snap.created_at },
      confirmedAfterBase: delta,
      current: snap.balance_jpy + delta,
      ageDays: age,
      stale: age > input.staleAfterDays,
    };
  });
}

export type ForecastItem = {
  /** 計算に使う日（シナリオの遅れ・期日超過の扱いを反映した日） */
  date: string;
  /** 元の予定日 */
  originalDate: string;
  accountId: string;
  direction: Direction;
  amount: number;
  category: Category;
  certainty: Certainty;
  source: "planned" | "recurring";
  sourceId: string;
  label: string;
  overdue: boolean;
  /** 範囲内の口座どうしの振替（入金・支払の合計には含めない） */
  internalTransfer: boolean;
};

export type ForecastDay = { date: string; inflow: number; outflow: number; balance: number };

export type ForecastResult = {
  today: string;
  horizonDays: number;
  /** 計算に含めた口座（残高未登録の口座は含めない） */
  accountIds: string[];
  missingBalanceAccountIds: string[];
  currentBalance: number;
  days: ForecastDay[];
  items: ForecastItem[];
  /** 範囲内の口座どうしの振替を除いた、予定入金・予定支払の合計 */
  totals: { inflow: number; outflow: number };
  balanceAt: (days: number) => number | null;
  /** 予測残高が 0 未満になる最初の日 */
  shortfall: { date: string; balance: number } | null;
  /** 最低必要残高を下回る最初の日 */
  minBalanceBreach: { date: string; balance: number; gap: number } | null;
  lowest: { date: string; balance: number };
  minBalance: number;
  /** 1日の支払が現在残高の一定割合以上の日 */
  concentrations: { date: string; outflow: number; ratio: number }[];
  /** 期日を過ぎても確定していない予定 */
  overdue: { inflow: number; outflow: number; count: number };
  /** 未確定の予定（見込みを含む）の件数 */
  unconfirmedCount: number;
};

export function buildForecast(input: {
  accounts: BankAccount[];
  snapshots: BalanceSnapshot[];
  transactions: CashTransaction[];
  rules: RecurringRule[];
  today: string;
  horizonDays: number;
  scope: Scope;
  assumptions: ScenarioAssumptions;
  minBalance: number;
  staleAfterDays: number;
  concentrationRatio?: number;
}): ForecastResult {
  const { today, assumptions: a } = input;
  const end = addDays(today, input.horizonDays);
  const scoped = accountsInScope(input.accounts, input.scope);
  const balances = accountBalances({ accounts: scoped, snapshots: input.snapshots, transactions: input.transactions, today, staleAfterDays: input.staleAfterDays });
  const included = new Set(balances.filter((b) => b.current != null).map((b) => b.accountId));
  const currentBalance = balances.reduce((n, b) => n + (b.current ?? 0), 0);

  // 振替の相手の口座（範囲内どうしかを判定する）
  const transferAccounts = new Map<string, string[]>();
  for (const t of input.transactions) {
    if (t.transfer_group_id && t.status !== "canceled") {
      transferAccounts.set(t.transfer_group_id, [...(transferAccounts.get(t.transfer_group_id) ?? []), t.bank_account_id]);
    }
  }

  const items: ForecastItem[] = [];
  const tomorrow = addDays(today, 1);
  const place = (date: string, direction: Direction, category: Category, certainty: Certainty, amount: number) => {
    const overdue = date < today;
    let d = date;
    let amt = amount;
    if (category === "transfer") return { date: overdue ? tomorrow : d, amount: amt, overdue };
    if (direction === "out") {
      if (overdue) d = tomorrow;
      if (certainty === "expected") amt = Math.ceil(amount * a.expectedOutflowRate);
      return { date: d, amount: amt, overdue };
    }
    if (certainty === "expected") {
      amt = Math.floor(amount * a.expectedInflowRate);
      if (overdue) d = tomorrow;
    } else if (overdue) {
      if (a.overdueInflow === "exclude") return null;
      d = a.overdueInflow === "delay7" ? addDays(today, 7) : tomorrow;
    } else {
      d = addDays(date, a.fixedInflowDelayDays);
    }
    if (amt <= 0) return null;
    return { date: d, amount: amt, overdue };
  };

  // 予定（未確定）の取引
  for (const t of input.transactions) {
    if (t.status !== "planned" || !t.planned_date || !included.has(t.bank_account_id)) continue;
    const placed = place(t.planned_date, t.direction, t.category, t.certainty, t.amount_jpy);
    if (!placed) continue;
    const legs = t.transfer_group_id ? (transferAccounts.get(t.transfer_group_id) ?? []) : [];
    items.push({
      date: placed.date,
      originalDate: t.planned_date,
      accountId: t.bank_account_id,
      direction: t.direction,
      amount: placed.amount,
      category: t.category,
      certainty: t.certainty,
      source: "planned",
      sourceId: t.id,
      label: t.counterparty || t.memo || "",
      overdue: placed.overdue,
      internalTransfer: Boolean(t.transfer_group_id) && legs.length === 2 && legs.every((id) => included.has(id)),
    });
  }

  // 繰返しの回（まだ取引として作られていないもの。今日以降の回だけ）
  const materialized = new Set(input.transactions.filter((t) => t.recurring_rule_id && t.occurrence_date).map((t) => `${t.recurring_rule_id}|${t.occurrence_date}`));
  for (const r of input.rules) {
    if (!r.is_active || !included.has(r.bank_account_id)) continue;
    for (const o of expandRule(r, addDays(today, -7), end)) {
      if (materialized.has(`${r.id}|${o.occurrenceDate}`) || o.date < today) continue;
      const placed = place(o.date, r.direction, r.category, r.certainty, r.amount_jpy);
      if (!placed) continue;
      items.push({
        date: placed.date,
        originalDate: o.date,
        accountId: r.bank_account_id,
        direction: r.direction,
        amount: placed.amount,
        category: r.category,
        certainty: r.certainty,
        source: "recurring",
        sourceId: r.id,
        label: r.counterparty || r.memo || "",
        overdue: false,
        internalTransfer: false,
      });
    }
  }

  const inHorizon = items.filter((i) => i.date >= today && i.date <= end).sort((x, y) => x.date.localeCompare(y.date));
  const days: ForecastDay[] = [];
  let bal = currentBalance;
  const byDate = new Map<string, ForecastItem[]>();
  for (const i of inHorizon) byDate.set(i.date, [...(byDate.get(i.date) ?? []), i]);
  for (let k = 0; k <= input.horizonDays; k++) {
    const date = addDays(today, k);
    let inflow = 0;
    let outflow = 0;
    for (const i of byDate.get(date) ?? []) {
      // 範囲内の振替は残高の合計を変えない（入金と支払が同額で打ち消し合う）が、合計の入出金には含めない
      if (i.internalTransfer) continue;
      if (i.direction === "in") inflow += i.amount;
      else outflow += i.amount;
    }
    bal += inflow - outflow;
    days.push({ date, inflow, outflow, balance: bal });
  }

  const shortfallDay = days.find((d) => d.balance < 0);
  const breachDay = days.find((d) => d.balance < input.minBalance);
  const lowest = days.reduce((m, d) => (d.balance < m.balance ? d : m), days[0]);
  const ratio = input.concentrationRatio ?? 0.3;
  const overdueItems = inHorizon.filter((i) => i.overdue && !i.internalTransfer);
  const planned = input.transactions.filter((t) => t.status === "planned" && included.has(t.bank_account_id));

  return {
    today,
    horizonDays: input.horizonDays,
    accountIds: [...included],
    missingBalanceAccountIds: balances.filter((b) => b.current == null).map((b) => b.accountId),
    currentBalance,
    days,
    items: inHorizon,
    totals: {
      inflow: inHorizon.filter((i) => !i.internalTransfer && i.direction === "in").reduce((n, i) => n + i.amount, 0),
      outflow: inHorizon.filter((i) => !i.internalTransfer && i.direction === "out").reduce((n, i) => n + i.amount, 0),
    },
    balanceAt: (n: number) => days[n]?.balance ?? null,
    shortfall: shortfallDay ? { date: shortfallDay.date, balance: shortfallDay.balance } : null,
    minBalanceBreach: breachDay && input.minBalance > 0 ? { date: breachDay.date, balance: breachDay.balance, gap: input.minBalance - breachDay.balance } : null,
    lowest: { date: lowest.date, balance: lowest.balance },
    minBalance: input.minBalance,
    concentrations:
      currentBalance > 0
        ? days.filter((d) => d.outflow >= currentBalance * ratio).map((d) => ({ date: d.date, outflow: d.outflow, ratio: Math.round((d.outflow / currentBalance) * 1000) / 10 }))
        : [],
    overdue: {
      inflow: planned.filter((t) => t.direction === "in" && t.planned_date! < today && !t.transfer_group_id).reduce((n, t) => n + t.amount_jpy, 0),
      outflow: overdueItems.filter((i) => i.direction === "out").reduce((n, i) => n + i.amount, 0),
      count: planned.filter((t) => t.planned_date! < today).length,
    },
    unconfirmedCount: planned.length,
  };
}
