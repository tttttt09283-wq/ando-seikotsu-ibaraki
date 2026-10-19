import { describe, expect, it } from "vitest";
import { addDays, clampedDate, isValidDate, shiftWeekend, todayJst } from "./dates";
import { accountBalances, buildForecast, type Scope } from "./forecast";
import { expandRule } from "./recurrence";
import { DEFAULT_SCENARIOS } from "./scenarios";
import type { BalanceSnapshot, BankAccount, CashTransaction, RecurringRule } from "./types";

const ORG = "org";
const TODAY = "2026-10-19"; // 月曜

const acc = (id: string, branch: string | null = null, extra: Partial<BankAccount> = {}): BankAccount => ({
  id,
  organization_id: ORG,
  branch_id: branch,
  name: id,
  bank_name: null,
  kind: "bank",
  number_last4: null,
  min_balance_jpy: 0,
  is_active: true,
  sort_order: 0,
  ...extra,
});
const snap = (account: string, date: string, amount: number): BalanceSnapshot => ({
  id: `s-${account}-${date}`,
  organization_id: ORG,
  bank_account_id: account,
  as_of_date: date,
  balance_jpy: amount,
  source: "manual",
  note: null,
  created_at: `${date}T09:00:00Z`,
});
let seq = 0;
const tx = (p: Partial<CashTransaction> & Pick<CashTransaction, "bank_account_id" | "direction" | "amount_jpy">): CashTransaction => ({
  id: `t${++seq}`,
  organization_id: ORG,
  branch_id: null,
  category: p.direction === "in" ? "sales" : "purchase",
  planned_date: null,
  confirmed_date: null,
  status: "planned",
  certainty: "fixed",
  counterparty: null,
  memo: null,
  transfer_group_id: null,
  recurring_rule_id: null,
  occurrence_date: null,
  created_at: "",
  updated_at: "",
  ...p,
});
const rule = (p: Partial<RecurringRule>): RecurringRule => ({
  id: "r1",
  organization_id: ORG,
  bank_account_id: "a1",
  branch_id: null,
  direction: "out",
  category: "rent",
  amount_jpy: 100_000,
  certainty: "fixed",
  counterparty: null,
  memo: null,
  frequency: "monthly",
  interval_count: 1,
  day_of_month: 31,
  weekday: null,
  month_of_year: null,
  start_date: "2026-01-01",
  end_date: null,
  weekend_shift: "none",
  is_active: true,
  ...p,
});

const standard = DEFAULT_SCENARIOS.standard.assumptions;
const run = (p: { accounts: BankAccount[]; snapshots: BalanceSnapshot[]; transactions?: CashTransaction[]; rules?: RecurringRule[]; scope?: Scope; horizon?: number; minBalance?: number; assumptions?: typeof standard }) =>
  buildForecast({
    accounts: p.accounts,
    snapshots: p.snapshots,
    transactions: p.transactions ?? [],
    rules: p.rules ?? [],
    today: TODAY,
    horizonDays: p.horizon ?? 90,
    scope: p.scope ?? { kind: "organization" },
    assumptions: p.assumptions ?? standard,
    minBalance: p.minBalance ?? 0,
    staleAfterDays: 7,
  });

describe("日付（Asia/Tokyo・月末・閏年）", () => {
  it("日本時間で今日を決める（UTC の前日 15:30 は日本の翌日 0:30）", () => {
    expect(todayJst(new Date("2026-10-18T15:30:00Z"))).toBe("2026-10-19");
    expect(todayJst(new Date("2026-10-18T14:59:59Z"))).toBe("2026-10-18");
  });
  it("月末・閏年に丸める", () => {
    expect(clampedDate(2027, 2, 31)).toBe("2027-02-28");
    expect(clampedDate(2028, 2, 31)).toBe("2028-02-29");
    expect(clampedDate(2100, 2, 29)).toBe("2100-02-28");
    expect(clampedDate(2026, 4, 31)).toBe("2026-04-30");
    expect(isValidDate("2027-02-29")).toBe(false);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("土日を前後の平日にずらす", () => {
    expect(shiftWeekend("2026-10-31", "previous")).toBe("2026-10-30"); // 土→金
    expect(shiftWeekend("2026-11-01", "next")).toBe("2026-11-02"); // 日→月
    expect(shiftWeekend("2026-11-02", "next")).toBe("2026-11-02");
  });
});

describe("繰返し", () => {
  it("毎月31日は各月の末日（閏年の2月は29日）", () => {
    const r = expandRule(rule({ start_date: "2027-12-01" }), "2027-12-01", "2028-04-30").map((o) => o.occurrenceDate);
    expect(r).toEqual(["2027-12-31", "2028-01-31", "2028-02-29", "2028-03-31", "2028-04-30"]);
  });
  it("2か月ごと・終了日・土日は前の平日", () => {
    const r = expandRule(rule({ day_of_month: 25, interval_count: 2, start_date: "2026-07-01", end_date: "2027-03-01", weekend_shift: "previous" }), "2026-01-01", "2027-12-31");
    expect(r.map((o) => o.occurrenceDate)).toEqual(["2026-07-25", "2026-09-25", "2026-11-25", "2027-01-25"]);
    expect(r[0].date).toBe("2026-07-24"); // 7/25 は土曜
  });
  it("毎年2月29日は閏年以外は2月28日、毎週は指定の曜日", () => {
    expect(expandRule(rule({ frequency: "yearly", month_of_year: 2, day_of_month: 29, start_date: "2027-01-01" }), "2027-01-01", "2029-12-31").map((o) => o.occurrenceDate)).toEqual([
      "2027-02-28",
      "2028-02-29",
      "2029-02-28",
    ]);
    expect(expandRule(rule({ frequency: "weekly", weekday: 5, day_of_month: null, start_date: "2026-10-01" }), "2026-10-19", "2026-11-06").map((o) => o.date)).toEqual([
      "2026-10-23",
      "2026-10-30",
      "2026-11-06",
    ]);
  });
});

describe("現在残高と二重計上の防止", () => {
  it("基準日以前の確定取引は足さず、基準日より後の確定取引だけ足す。取消は数えない", () => {
    const b = accountBalances({
      accounts: [acc("a1")],
      snapshots: [snap("a1", "2026-10-10", 1_000_000), snap("a1", "2026-10-01", 5)],
      transactions: [
        tx({ bank_account_id: "a1", direction: "in", amount_jpy: 999, status: "confirmed", confirmed_date: "2026-10-10" }),
        tx({ bank_account_id: "a1", direction: "in", amount_jpy: 200_000, status: "confirmed", confirmed_date: "2026-10-15" }),
        tx({ bank_account_id: "a1", direction: "out", amount_jpy: 50_000, status: "confirmed", confirmed_date: "2026-10-19" }),
        tx({ bank_account_id: "a1", direction: "out", amount_jpy: 70_000, status: "canceled", confirmed_date: "2026-10-16" }),
        tx({ bank_account_id: "a1", direction: "out", amount_jpy: 1, status: "confirmed", confirmed_date: "2026-10-20" }),
      ],
      today: TODAY,
      staleAfterDays: 7,
    });
    expect(b[0]).toMatchObject({ current: 1_150_000, confirmedAfterBase: 150_000, ageDays: 9, stale: true });
  });

  it("予定を確定に変えた取引は、予測に二重に入らない", () => {
    const planned = tx({ bank_account_id: "a1", direction: "in", amount_jpy: 300_000, planned_date: "2026-10-25" });
    const before = run({ accounts: [acc("a1")], snapshots: [snap("a1", "2026-10-18", 1_000_000)], transactions: [planned] });
    expect(before.balanceAt(30)).toBe(1_300_000);
    // 同じ行が確定になった（入金は今日）
    const done = { ...planned, status: "confirmed" as const, confirmed_date: TODAY };
    const after = run({ accounts: [acc("a1")], snapshots: [snap("a1", "2026-10-18", 1_000_000)], transactions: [done] });
    expect(after.currentBalance).toBe(1_300_000);
    expect(after.balanceAt(30)).toBe(1_300_000);
  });

  it("繰返しの回は、同じ回の取引があれば作らない", () => {
    const r = rule({ day_of_month: 31 });
    // 基準残高は昨日の終わり時点（今日の確定取引は基準残高に含まれない）
    const base = { accounts: [acc("a1")], snapshots: [snap("a1", "2026-10-18", 1_000_000)], rules: [r], horizon: 45 };
    expect(run(base).totals.outflow).toBe(200_000); // 10/31・11/30
    const materialized = tx({ bank_account_id: "a1", direction: "out", category: "rent", amount_jpy: 100_000, status: "confirmed", confirmed_date: "2026-10-19", recurring_rule_id: "r1", occurrence_date: "2026-10-31" });
    const res = run({ ...base, transactions: [materialized] });
    expect(res.totals.outflow).toBe(100_000);
    expect(res.balanceAt(45)).toBe(1_000_000 - 100_000 - 100_000);
  });
});

describe("口座間振替・複数店舗", () => {
  const accounts = [acc("hq"), acc("s1", "b1"), acc("s2", "b2")];
  const snapshots = [snap("hq", TODAY, 2_000_000), snap("s1", TODAY, 300_000), snap("s2", TODAY, 500_000)];
  const g = "g1";
  const transfer = [
    tx({ bank_account_id: "hq", direction: "out", category: "transfer", amount_jpy: 400_000, planned_date: "2026-10-25", transfer_group_id: g }),
    tx({ bank_account_id: "s1", direction: "in", category: "transfer", amount_jpy: 400_000, planned_date: "2026-10-25", transfer_group_id: g }),
  ];
  const payroll = tx({ bank_account_id: "s1", branch_id: "b1", direction: "out", category: "payroll", amount_jpy: 600_000, planned_date: "2026-10-26" });

  it("企業全体では振替で残高も入出金合計も変わらない。口座の残高は重複せず1回だけ数える", () => {
    const r = run({ accounts, snapshots, transactions: [...transfer, payroll] });
    expect(r.currentBalance).toBe(2_800_000);
    expect(r.totals).toEqual({ inflow: 0, outflow: 600_000 });
    expect(r.balanceAt(30)).toBe(2_200_000);
  });

  it("店舗では、店舗の外の口座からの振替は入金として数える。店舗の合計＋本部＝企業全体", () => {
    const b1 = run({ accounts, snapshots, transactions: [...transfer, payroll], scope: { kind: "branch", branchId: "b1" } });
    expect(b1.currentBalance).toBe(300_000);
    expect(b1.totals).toEqual({ inflow: 400_000, outflow: 600_000 });
    expect(b1.balanceAt(30)).toBe(100_000);
    const b2 = run({ accounts, snapshots, transactions: [...transfer, payroll], scope: { kind: "branch", branchId: "b2" } });
    expect(b1.currentBalance + b2.currentBalance + 2_000_000).toBe(2_800_000);
  });

  it("確定した振替も、企業全体の現在残高を変えない", () => {
    const done = transfer.map((t) => ({ ...t, status: "confirmed" as const, confirmed_date: TODAY, planned_date: null }));
    const s = [snap("hq", "2026-10-18", 2_000_000), snap("s1", "2026-10-18", 300_000), snap("s2", "2026-10-18", 500_000)];
    expect(run({ accounts, snapshots: s, transactions: done }).currentBalance).toBe(2_800_000);
    expect(run({ accounts, snapshots: s, transactions: done, scope: { kind: "branch", branchId: "b1" } }).currentBalance).toBe(700_000);
  });

  it("残高未登録の口座は合計に入れず、知らせる", () => {
    const r = run({ accounts: [...accounts, acc("new")], snapshots });
    expect(r.missingBalanceAccountIds).toEqual(["new"]);
    expect(r.currentBalance).toBe(2_800_000);
  });
});

describe("資金不足の判定とシナリオ", () => {
  const accounts = [acc("a1")];
  const snapshots = [snap("a1", TODAY, 500_000)];
  const txs = [
    tx({ bank_account_id: "a1", direction: "out", category: "payroll", amount_jpy: 400_000, planned_date: "2026-10-25" }),
    tx({ bank_account_id: "a1", direction: "out", category: "rent", amount_jpy: 200_000, planned_date: "2026-10-31" }),
    tx({ bank_account_id: "a1", direction: "in", category: "receivable", amount_jpy: 300_000, planned_date: "2026-10-30" }),
    tx({ bank_account_id: "a1", direction: "in", category: "sales", certainty: "expected", amount_jpy: 1_000_000, planned_date: "2026-11-10" }),
    // 期日を過ぎた未入金・未払い
    tx({ bank_account_id: "a1", direction: "in", category: "receivable", amount_jpy: 50_000, planned_date: "2026-10-10" }),
    tx({ bank_account_id: "a1", direction: "out", category: "tax", amount_jpy: 30_000, planned_date: "2026-10-15" }),
  ];

  it("標準：資金不足予測日・最低必要残高割れ・支払集中・期日超過を出す", () => {
    const r = run({ accounts, snapshots, transactions: txs, minBalance: 200_000 });
    // 10/20 未払い税金 −3万 → 47万、10/25 給与 −40万 → 7万、10/26 未入金 +5万 → 12万、10/30 回収 +30万 → 42万、10/31 家賃 −20万 → 22万、11/10 見込み80万 → 102万
    expect(r.balanceAt(1)).toBe(470_000);
    expect(r.days.find((d) => d.date === "2026-10-25")?.balance).toBe(70_000);
    expect(r.shortfall).toBeNull();
    expect(r.minBalanceBreach).toEqual({ date: "2026-10-25", balance: 70_000, gap: 130_000 });
    expect(r.lowest).toEqual({ date: "2026-10-25", balance: 70_000 });
    expect(r.concentrations.map((c) => c.date)).toContain("2026-10-25");
    expect(r.balanceAt(30)).toBe(1_020_000);
    expect(r.overdue).toMatchObject({ inflow: 50_000, count: 2 });
    expect(r.unconfirmedCount).toBe(6);
  });

  it("保守：入金は7日遅れ・見込みは含めない・期日超過の入金は含めない → 資金不足を検知", () => {
    const r = run({ accounts, snapshots, transactions: txs, assumptions: DEFAULT_SCENARIOS.conservative.assumptions });
    // 10/25 給与で 7万、10/31 家賃で −13万（回収は 11/6 に遅れる）
    expect(r.shortfall).toEqual({ date: "2026-10-31", balance: -130_000 });
    expect(r.balanceAt(30)).toBe(170_000);
  });

  it("シナリオを変えると再計算される（楽観は見込みを全額・期日超過の入金は明日）", () => {
    const o = run({ accounts, snapshots, transactions: txs, assumptions: DEFAULT_SCENARIOS.optimistic.assumptions });
    expect(o.balanceAt(1)).toBe(520_000);
    expect(o.balanceAt(30)).toBe(1_220_000);
    const s = run({ accounts, snapshots, transactions: txs });
    expect(o.balanceAt(30)! - s.balanceAt(30)!).toBe(200_000);
  });

  it("予測期間の外の予定は含めない", () => {
    expect(run({ accounts, snapshots, transactions: txs, horizon: 7 }).totals.inflow).toBe(50_000);
  });
});
