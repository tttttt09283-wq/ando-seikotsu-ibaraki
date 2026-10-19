import Link from "next/link";
import { CancelForm, ConfirmForm, ConfirmOccurrenceForm, RuleForm, ToggleRuleForm, TransactionForm } from "@/components/app/TransactionForms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { addDays, formatJpDate } from "@/lib/cash/dates";
import { yen } from "@/lib/cash/money";
import { expandRule } from "@/lib/cash/recurrence";
import { CATEGORY_LABEL, type CashTransaction } from "@/lib/cash/types";
import { requireOrg } from "@/lib/data";
import { canWrite } from "@/lib/data/repo";
import { cn } from "@/lib/utils";

export const metadata = { title: "入出金一覧" };

const FILTERS = [
  { id: "planned", label: "予定" },
  { id: "overdue", label: "期日超過" },
  { id: "confirmed", label: "確定" },
  { id: "canceled", label: "取消" },
  { id: "all", label: "すべて" },
] as const;

const dateOf = (t: CashTransaction) => (t.status === "confirmed" ? t.confirmed_date : t.planned_date) ?? "";
const FREQ = { monthly: "毎月", weekly: "毎週", yearly: "毎年" } as const;

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ status?: string; done?: string }> }) {
  const { data, today } = await requireOrg();
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f.id === sp.status)?.id ?? "planned";
  const writable = canWrite(data.role);
  const account = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "";
  const branch = (id: string | null) => (id ? data.branches.find((b) => b.id === id)?.name : null);

  const rows = data.transactions
    .filter((t) =>
      filter === "all"
        ? true
        : filter === "overdue"
          ? t.status === "planned" && (t.planned_date ?? "") < today
          : t.status === filter,
    )
    .sort((a, b) => (filter === "planned" || filter === "overdue" ? dateOf(a).localeCompare(dateOf(b)) : dateOf(b).localeCompare(dateOf(a))))
    .slice(0, 300);

  // 振替は2件を1行にまとめて表示する
  const seenGroups = new Set<string>();
  const shown = rows.filter((t) => {
    if (!t.transfer_group_id) return true;
    if (seenGroups.has(t.transfer_group_id)) return false;
    seenGroups.add(t.transfer_group_id);
    return true;
  });

  const materialized = new Set(data.transactions.filter((t) => t.recurring_rule_id).map((t) => `${t.recurring_rule_id}|${t.occurrence_date}`));
  const occurrences = data.rules
    .filter((r) => r.is_active)
    .flatMap((r) => expandRule(r, addDays(today, -31), addDays(today, 31)).map((o) => ({ r, o })))
    .filter(({ r, o }) => !materialized.has(`${r.id}|${o.occurrenceDate}`))
    .sort((a, b) => a.o.date.localeCompare(b.o.date));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">入出金一覧</h1>
        <p className="text-muted-foreground text-sm">
          予定が実際に動いたら「確定」にします（同じ1件のまま確定になるので、予定と実績を二重に数えません）。金額は消費税等を含む実際の入出金額です。
        </p>
      </div>

      {sp.done && (
        <p role="status" className="border-good/50 bg-good/10 rounded-lg border px-3 py-2 text-sm">
          {sp.done === "canceled" ? "取り消しました（計算に含めません。記録は残ります）。" : "確定にしました。予定と実績は同じ1件として数えるので、二重に計上されません。"}
        </p>
      )}

      {writable && data.accounts.length > 0 && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>入出金・予定を登録</CardTitle>
              <CardDescription>借入は「借入入金」「借入返済（元本）」「借入利息」を分けて登録してください。</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <TransactionForm accounts={data.accounts} branches={data.branches} today={today} />
          </CardContent>
        </Card>
      )}
      {data.accounts.length === 0 && (
        <p className="text-sm">
          先に
          <Link href="/settings" className="text-brand font-medium hover:underline">
            設定
          </Link>
          で口座を登録してください。
        </p>
      )}

      <Card>
        <CardHeader className="flex-wrap">
          <CardTitle>取引</CardTitle>
          <nav className="flex flex-wrap gap-1" aria-label="絞り込み">
            {FILTERS.map((f) => (
              <Link
                key={f.id}
                href={`/transactions?status=${f.id}`}
                aria-current={filter === f.id ? "page" : undefined}
                className={cn("rounded-full px-3 py-1 text-sm", filter === f.id ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent")}
              >
                {f.label}
              </Link>
            ))}
          </nav>
        </CardHeader>
        <CardContent>
          {shown.length === 0 ? (
            <p className="text-muted-foreground text-sm">該当する取引はありません。</p>
          ) : (
            <ul className="divide-y">
              {shown.map((t) => {
                const pair = t.transfer_group_id ? data.transactions.filter((x) => x.transfer_group_id === t.transfer_group_id) : [];
                const from = pair.find((x) => x.direction === "out");
                const to = pair.find((x) => x.direction === "in");
                const overdue = t.status === "planned" && (t.planned_date ?? "") < today;
                return (
                  <li key={t.id} className="space-y-2 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 text-sm">
                        <p className="flex flex-wrap items-center gap-1.5">
                          <span className="text-muted-foreground tabular-nums">{formatJpDate(dateOf(t))}</span>
                          <span className="font-medium">{CATEGORY_LABEL[t.category]}</span>
                          {t.counterparty && <span className="text-muted-foreground">・{t.counterparty}</span>}
                        </p>
                        <p className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
                          {t.transfer_group_id ? `${account(from?.bank_account_id ?? "")} → ${account(to?.bank_account_id ?? "")}` : account(t.bank_account_id)}
                          {branch(t.branch_id) && <span>・{branch(t.branch_id)}</span>}
                          <Badge variant={t.status === "confirmed" ? "secondary" : "outline"}>{{ planned: "予定", confirmed: "確定", canceled: "取消" }[t.status]}</Badge>
                          {t.certainty === "expected" && t.status === "planned" && <Badge variant="outline">見込み</Badge>}
                          {t.recurring_rule_id && <Badge variant="outline">繰返し</Badge>}
                          {overdue && <Badge variant="outline" className="border-warn text-warn">期日超過</Badge>}
                          {t.memo && <span className="truncate">・{t.memo}</span>}
                        </p>
                      </div>
                      <span className={cn("shrink-0 font-semibold tabular-nums", t.status === "canceled" && "text-muted-foreground line-through", t.direction === "in" && !t.transfer_group_id && "text-good")}>
                        {t.transfer_group_id ? "" : t.direction === "in" ? "+" : "−"}
                        {yen(t.amount_jpy)}
                      </span>
                    </div>
                    {writable && t.status === "planned" && (
                      <div className="flex flex-wrap items-end justify-between gap-2">
                        <ConfirmForm id={t.id} amount={t.amount_jpy} today={today} returnStatus={filter} />
                        <CancelForm id={t.id} returnStatus={filter} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {rows.length >= 300 && <p className="text-muted-foreground mt-2 text-xs">最新の300件まで表示しています。</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>繰返しの回（前後31日）</CardTitle>
            <CardDescription>繰返し設定から計算した回です。実際に入出金したら「確定」にしてください。予定日を過ぎた回は予測に含めません（確定か、設定の見直しを）。</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {occurrences.length === 0 ? (
            <p className="text-muted-foreground text-sm">対象の回はありません。</p>
          ) : (
            <ul className="divide-y">
              {occurrences.map(({ r, o }) => (
                <li key={`${r.id}-${o.occurrenceDate}`} className="space-y-2 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0">
                      <span className={cn("mr-2 tabular-nums", o.date < today ? "text-warn" : "text-muted-foreground")}>{formatJpDate(o.date)}</span>
                      {CATEGORY_LABEL[r.category]}
                      {r.counterparty && <span className="text-muted-foreground">・{r.counterparty}</span>}
                      <span className="text-muted-foreground block text-xs">
                        {account(r.bank_account_id)}
                        {r.certainty === "expected" && "・見込み"}
                        {o.date < today && "・予定日を過ぎています"}
                      </span>
                    </p>
                    <span className={cn("shrink-0 font-semibold tabular-nums", r.direction === "in" && "text-good")}>
                      {r.direction === "in" ? "+" : "−"}
                      {yen(r.amount_jpy)}
                    </span>
                  </div>
                  {writable && o.date <= addDays(today, 7) && <ConfirmOccurrenceForm ruleId={r.id} occurrenceDate={o.occurrenceDate} plannedDate={o.date} amount={r.amount_jpy} today={today} />}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card id="rules">
        <CardHeader>
          <div>
            <CardTitle>定期支払・定期入金（繰返し設定）</CardTitle>
            <CardDescription>家賃・給与・借入返済・社会保険など。予測に自動で入ります。</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {data.rules.length > 0 && (
            <ul className="divide-y text-sm">
              {data.rules.map((r) => (
                <li key={r.id} className={cn("flex flex-wrap items-center justify-between gap-2 py-2", !r.is_active && "opacity-60")}>
                  <div className="min-w-0">
                    <p className="font-medium">
                      {r.counterparty || CATEGORY_LABEL[r.category]}
                      {!r.is_active && <Badge variant="outline" className="ml-2">停止中</Badge>}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {FREQ[r.frequency]}
                      {r.interval_count > 1 && `（${r.interval_count}${r.frequency === "weekly" ? "週" : r.frequency === "monthly" ? "か月" : "年"}ごと）`}
                      {r.frequency === "weekly" ? ` ${"日月火水木金土"[r.weekday ?? 0]}曜日` : `${r.month_of_year ? ` ${r.month_of_year}月` : ""} ${r.day_of_month === 31 ? "末日" : `${r.day_of_month}日`}`}
                      ・{CATEGORY_LABEL[r.category]}・{account(r.bank_account_id)}
                      {r.certainty === "expected" && "・見込み"}
                      {r.end_date && `・${formatJpDate(r.end_date, false)}まで`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("font-semibold tabular-nums", r.direction === "in" && "text-good")}>
                      {r.direction === "in" ? "+" : "−"}
                      {yen(r.amount_jpy)}
                    </span>
                    {writable && <ToggleRuleForm id={r.id} active={r.is_active} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {writable && data.accounts.length > 0 && (
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">繰返しを追加する</summary>
              <div className="mt-3">
                <RuleForm accounts={data.accounts} branches={data.branches} today={today} />
              </div>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
