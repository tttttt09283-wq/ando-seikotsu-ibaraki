import Link from "next/link";
import { AlertTriangle, CircleAlert, Clock, Database } from "lucide-react";
import { BalanceChart } from "@/components/app/BalanceChart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { daysBetween, formatDateTimeJst, formatJpDate } from "@/lib/cash/dates";
import { yen } from "@/lib/cash/money";
import { CATEGORY_LABEL } from "@/lib/cash/types";
import { requireOrg } from "@/lib/data";
import { dashboardModel } from "@/lib/dashboard";
import { cn } from "@/lib/utils";

export const metadata = { title: "ダッシュボード" };

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: "good" | "warn" | "bad" }) {
  return (
    <div
      className={cn(
        "bg-card rounded-xl border p-4",
        tone === "bad" && "border-bad/50 bg-bad/5",
        tone === "warn" && "border-warn/60 bg-warn/10",
      )}
    >
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn("mt-1 text-xl font-bold tabular-nums sm:text-2xl", tone === "bad" && "text-bad")}>{value}</p>
      {sub && <div className="text-muted-foreground mt-1 text-xs">{sub}</div>}
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { data, today, repo } = await requireOrg();
  const sp = await searchParams;
  const m = dashboardModel(data, today, sp.scope);
  const { std, cons } = m;
  const at = (n: number) => std.balanceAt(n);
  const noAccounts = data.accounts.length === 0;
  const name = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">資金ダッシュボード</h1>
          <p className="text-muted-foreground text-sm">
            {formatJpDate(today)} 時点・{m.scopeLabel}・予測は「標準」シナリオ（
            <Link href="/forecast" className="text-brand underline-offset-2 hover:underline">
              仮定を見る
            </Link>
            ）
          </p>
        </div>
        {data.branches.length > 0 && (
          <nav className="flex flex-wrap gap-1" aria-label="表示する範囲">
            {[{ id: "all", name: "企業全体" }, ...data.branches.filter((b) => b.is_active)].map((b) => (
              <Link
                key={b.id}
                href={b.id === "all" ? "/" : `/?scope=${b.id}`}
                aria-current={m.scopeValue === b.id ? "page" : undefined}
                className={cn("rounded-full px-3 py-1.5 text-sm", m.scopeValue === b.id ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent")}
              >
                {b.name}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {noAccounts && (
        <Card className="border-warn/60">
          <CardContent className="text-sm">
            まだ口座が登録されていません。
            <Link href="/settings" className="text-brand font-medium hover:underline">
              設定
            </Link>
            で店舗・口座と基準残高を登録すると、残高と予測が表示されます。
          </CardContent>
        </Card>
      )}

      {/* 警告 */}
      {(std.shortfall || cons.shortfall || std.minBalanceBreach || m.staleAccounts.length > 0 || std.missingBalanceAccountIds.length > 0 || std.overdue.count > 0) && (
        <section aria-label="注意" className="space-y-2">
          {std.shortfall && (
            <p className="border-bad/50 bg-bad/10 text-bad flex items-start gap-2 rounded-lg border px-3 py-2 text-sm font-medium">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {formatJpDate(std.shortfall.date)}に資金が不足する予測です（予測残高 {yen(std.shortfall.balance)}・標準）
            </p>
          )}
          {!std.shortfall && cons.shortfall && (
            <p className="border-warn/60 bg-warn/10 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
              <AlertTriangle className="text-warn mt-0.5 size-4 shrink-0" aria-hidden />
              保守シナリオ（入金が遅れる・見込みが入らない場合）では、{formatJpDate(cons.shortfall.date)}に資金が不足します（{yen(cons.shortfall.balance)}）
            </p>
          )}
          {std.minBalanceBreach && (
            <p className="border-warn/60 bg-warn/10 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
              <CircleAlert className="text-warn mt-0.5 size-4 shrink-0" aria-hidden />
              {formatJpDate(std.minBalanceBreach.date)}に最低必要残高（{yen(std.minBalance)}）を {yen(std.minBalanceBreach.gap)} 下回る予測です
            </p>
          )}
          {std.overdue.count > 0 && (
            <p className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
              <Clock className="text-warn mt-0.5 size-4 shrink-0" aria-hidden />
              予定日を過ぎても未確定の取引が {std.overdue.count}件あります（未入金 {yen(std.overdue.inflow)}）。
              <Link href="/transactions?status=overdue" className="text-brand hover:underline">
                確認する
              </Link>
            </p>
          )}
          {m.staleAccounts.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
              <Database className="text-warn mt-0.5 size-4 shrink-0" aria-hidden />
              残高が{data.organization.stale_after_days}日以上更新されていない・未登録の口座：
              {m.staleAccounts.map((b) => `${name(b.accountId)}${b.ageDays != null ? `（${b.ageDays}日前）` : "（未登録）"}`).join("、")}。
              <Link href="/settings#accounts" className="text-brand hover:underline">
                残高を登録
              </Link>
            </p>
          )}
        </section>
      )}

      <section aria-label="残高と予測" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="現在の現預金残高"
          value={yen(std.currentBalance)}
          sub={
            <>
              {std.accountIds.length}口座の合計（重複なし）
              {std.missingBalanceAccountIds.length > 0 && <span className="text-warn block">残高未登録 {std.missingBalanceAccountIds.length}口座は含まず</span>}
            </>
          }
        />
        {[7, 30, 90].map((n) => {
          const v = at(n);
          const c = cons.balanceAt(n);
          return (
            <Stat
              key={n}
              label={`${n}日後の予測残高`}
              value={v != null ? yen(v) : "—"}
              tone={v != null && v < 0 ? "bad" : v != null && v < m.minBalance ? "warn" : undefined}
              sub={c != null ? `保守 ${yen(c)}` : undefined}
            />
          );
        })}
        <Stat label="30日以内の入金予定" value={yen(m.totals30.inflow)} sub="見込みは反映率をかけた額・振替を除く" />
        <Stat label="30日以内の支払予定" value={yen(m.totals30.outflow)} sub="繰返しの支払を含む・振替を除く" />
        <Stat
          label="資金不足予測日"
          value={std.shortfall ? formatJpDate(std.shortfall.date, false) : "180日以内はなし"}
          tone={std.shortfall ? "bad" : cons.shortfall ? "warn" : "good"}
          sub={cons.shortfall ? `保守では ${formatJpDate(cons.shortfall.date, false)}` : "保守でも不足なし"}
        />
        <Stat
          label="最低必要残高との差（最も少ない日）"
          value={m.minBalance > 0 ? yen(std.lowest.balance - m.minBalance) : "未設定"}
          tone={m.minBalance > 0 && std.lowest.balance < m.minBalance ? "warn" : undefined}
          sub={m.minBalance > 0 ? `最低必要残高 ${yen(m.minBalance)}・${formatJpDate(std.lowest.date, false)}に ${yen(std.lowest.balance)}` : <Link href="/settings" className="text-brand hover:underline">設定で登録</Link>}
        />
      </section>

      <Card>
        <CardHeader className="flex-wrap">
          <div>
            <CardTitle>日別の資金推移（予測）</CardTitle>
            <CardDescription>今日の残高は確定値。明日以降は予定とシナリオの仮定から計算した予測値です。</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <BalanceChart data={m.chart} minBalance={m.minBalance} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>14日以内の入出金予定</CardTitle>
              <CardDescription>未確定の予定と繰返しの回。確定したら入出金一覧で「確定」にしてください。</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {m.upcoming.length === 0 ? (
              <p className="text-muted-foreground text-sm">予定はありません。</p>
            ) : (
              <ul className="divide-y text-sm">
                {m.upcoming.slice(0, 20).map((i, k) => (
                  <li key={`${i.sourceId}-${i.date}-${k}`} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate">
                        <span className="text-muted-foreground mr-2 tabular-nums">{formatJpDate(i.date)}</span>
                        {CATEGORY_LABEL[i.category]}
                        {i.label && <span className="text-muted-foreground">・{i.label}</span>}
                      </p>
                      <p className="text-muted-foreground flex flex-wrap gap-1 text-xs">
                        {name(i.accountId)}
                        {i.certainty === "expected" && <Badge variant="outline">見込み</Badge>}
                        {i.source === "recurring" && <Badge variant="outline">繰返し</Badge>}
                        {i.overdue && <Badge variant="outline" className="border-warn text-warn">期日超過（{formatJpDate(i.originalDate, false)}）</Badge>}
                        {i.internalTransfer && <Badge variant="outline">口座間振替（社内）</Badge>}
                      </p>
                    </div>
                    <span className={cn("shrink-0 font-semibold tabular-nums", i.direction === "in" ? "text-good" : "")}>
                      {i.direction === "in" ? "+" : "−"}
                      {yen(i.amount).replace("¥", "¥")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>口座別の残高</CardTitle>
              <CardDescription>基準残高（登録した確定残高）＋その後の確定取引。</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="divide-y text-sm">
              {m.balances.map((b) => (
                <li key={b.accountId} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{b.account.name}</p>
                    <p className={cn("text-xs", b.stale ? "text-warn" : "text-muted-foreground")}>
                      {b.base ? `基準残高 ${formatJpDate(b.base.date, false)}（${daysBetween(b.base.date, today)}日前）` : "残高未登録"}
                      {b.confirmedAfterBase !== 0 && `・その後の確定 ${b.confirmedAfterBase > 0 ? "+" : ""}${yen(b.confirmedAfterBase)}`}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">{b.current != null ? yen(b.current) : "—"}</span>
                </li>
              ))}
            </ul>
            <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t pt-3 text-xs">
              <dt>最終更新</dt>
              <dd>{m.lastUpdated ? formatDateTimeJst(m.lastUpdated) : "—"}</dd>
              <dt>データの出所</dt>
              <dd>{[...m.sources, repo.mode === "demo" ? "デモデータ" : null].filter(Boolean).join("・") || "—"}</dd>
              <dt>未確定の予定</dt>
              <dd>{std.unconfirmedCount}件</dd>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
