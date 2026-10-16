"use client";

import Link from "next/link";
import { ArrowRight, CircleAlert, CircleCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatJpy } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useCompany } from "./StateProvider";

/** 億・万の単位で短く表示（例：1.25億円、3,400万円） */
export function formatOku(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (a >= 100_000_000) return `${sign}${(a / 100_000_000).toFixed(2).replace(/\.?0+$/, "")}億円`;
  if (a >= 10_000) return `${sign}${Math.round(a / 10_000).toLocaleString("ja-JP")}万円`;
  return `${sign}${formatJpy(a)}`;
}

export const monthLabel = (m: string) => `${Number(m.slice(5))}月`;

type Revenue = ReturnType<typeof useCompany>["snapshot"]["revenue"];

/** 月別の売上（実績・今月の着地予想・計画）。点線は3億円の月平均 */
export function MonthStrip({ r }: { r: Revenue }) {
  const monthlyTarget = r.targetJpy / r.totalMonths;
  const max = Math.max(1, monthlyTarget, ...r.byMonth.map((m) => Math.max(m.forecastJpy ?? 0, m.planJpy ?? 0, m.actualJpy ?? 0)));
  return (
    <section aria-label="月別の売上" className="relative">
      <div className="text-muted-foreground mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="bg-brand inline-block size-2.5 rounded-sm" /> 実績
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="bg-brand/45 inline-block size-2.5 rounded-sm" /> 今月の着地予想
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="border-muted-foreground/60 inline-block size-2.5 rounded-sm border border-dashed" /> 事業計画
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="border-muted-foreground/60 inline-block w-4 border-t border-dashed" /> 3億円の月平均 {formatOku(monthlyTarget)}
        </span>
      </div>
      <div className="relative flex h-32 items-end gap-1 border-b">
        <div aria-hidden className="border-muted-foreground/50 pointer-events-none absolute inset-x-0 z-10 border-t border-dashed" style={{ bottom: `${(monthlyTarget / max) * 100}%` }} />
        {r.byMonth.map((m) => {
          const value = m.status === "future" ? null : m.status === "current" ? (m.forecastJpy ?? m.actualJpy) : m.actualJpy;
          const plan = m.planJpy;
          const tip = [
            m.month,
            m.actualJpy != null ? `実績 ${formatJpy(m.actualJpy)}` : m.status !== "future" ? "未取り込み" : null,
            m.status === "current" && m.forecastJpy != null ? `着地予想 ${formatJpy(m.forecastJpy)}` : null,
            plan != null ? `計画 ${formatJpy(plan)}` : null,
          ]
            .filter(Boolean)
            .join(" ／ ");
          return (
            <div key={m.month} className="group relative flex h-full flex-1 items-end justify-center" title={tip}>
              {plan != null && (
                <div aria-hidden className="border-muted-foreground/50 absolute bottom-0 w-full rounded-t-[4px] border border-b-0 border-dashed" style={{ height: `${(plan / max) * 100}%` }} />
              )}
              {value != null && (
                <div
                  className={cn("relative w-[70%] rounded-t-[4px] group-hover:opacity-80", m.status === "current" ? "bg-brand/45" : "bg-brand")}
                  style={{ height: `${(value / max) * 100}%` }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="text-muted-foreground mt-1 flex gap-1 text-[10px]">
        {r.byMonth.map((m) => (
          <span key={m.month} className={cn("flex-1 text-center", m.status === "current" && "text-foreground font-semibold")}>
            {monthLabel(m.month)}
          </span>
        ))}
      </div>
      <div className="sr-only">
      <table>
        <caption>月別の売上</caption>
        <thead>
          <tr>
            <th>月</th>
            <th>実績</th>
            <th>着地予想</th>
            <th>計画</th>
          </tr>
        </thead>
        <tbody>
          {r.byMonth.map((m) => (
            <tr key={m.month}>
              <th>{m.month}</th>
              <td>{m.actualJpy != null ? formatJpy(m.actualJpy) : "—"}</td>
              <td>{m.forecastJpy != null ? formatJpy(m.forecastJpy) : "—"}</td>
              <td>{m.planJpy != null ? formatJpy(m.planJpy) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}

/** ダッシュボード用：年間3億円の進捗と、今月の院別の着地見込み */
export function RevenueCard() {
  const { snapshot } = useCompany();
  const r = snapshot.revenue;
  const onTrack = r.landingJpy >= r.targetJpy;

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <div>
          <CardTitle>売上目標の進捗（{r.label}）</CardTitle>
          <CardDescription>
            {r.fromMonth.replace("-", "年")}月〜{r.toMonth.replace("-", "年")}月 ・ {r.scope}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">本番の数字</Badge>
          <Link href="/numbers" className="text-brand inline-flex items-center gap-1 text-sm font-medium hover:underline">
            院別の数字 <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!r.hasData ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
            まだ数字が取り込まれていません。
            <Link href="/numbers" className="text-brand font-medium hover:underline">
              「数字」画面
            </Link>
            で、月ごとの日計表（スプレッドシート）を登録するか、CSVを取り込んでください。
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <div className="text-muted-foreground text-xs">累計の実績（{r.elapsedMonths}/{r.totalMonths}か月）</div>
                <div className="text-2xl font-bold tabular-nums">{formatOku(r.actualJpy)}</div>
                <div className="text-muted-foreground text-xs">目標の {r.percent}%</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">年間の着地見込み</div>
                <div className="text-2xl font-bold tabular-nums">{formatOku(r.landingJpy)}</div>
                <div className={cn("flex items-center gap-1 text-xs", onTrack ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")}>
                  {onTrack ? <CircleCheck className="size-3.5" aria-hidden /> : <CircleAlert className="size-3.5" aria-hidden />}
                  {onTrack ? "3億円に届く見込み" : `3億円まで あと${formatOku(r.targetJpy - r.landingJpy)}`}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">残りの月で必要な月平均</div>
                <div className="text-2xl font-bold tabular-nums">{formatOku(r.requiredMonthlyJpy)}</div>
                <div className="text-muted-foreground text-xs">{r.hasPlan ? `事業計画の年間合計 ${formatOku(r.planTotalJpy)}` : "事業計画は未取り込み"}</div>
              </div>
            </div>
            <Progress value={r.landingPercent} aria-label={`年間の着地見込みは目標の${r.landingPercent}%`} indicatorClassName="bg-brand/45" />
            <p className="text-muted-foreground -mt-2 text-xs">
              着地見込み＝過ぎた月の実績＋今月の着地予想{r.hasPlan ? "＋これからの月の事業計画" : "（これからの月は事業計画を取り込むと加算されます）"}
            </p>
            {r.missingMonths.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <CircleAlert className="size-3.5" aria-hidden />
                未取り込みの月：{r.missingMonths.map(monthLabel).join("・")}
              </p>
            )}

            <section aria-label="今月の院別の着地見込み">
              <h3 className="text-muted-foreground mb-2 text-xs font-semibold">
                {monthLabel(r.currentMonth)}の院別：着地予想 ÷ 目標
              </h3>
              <ul className="space-y-2">
                {r.byClinic.map((c) => (
                  <li key={c.clinicId} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-sm">
                    <span className="truncate font-medium">{c.name}</span>
                    <Progress value={c.forecastRate ?? 0} aria-label={`${c.name}の着地率`} className="h-1.5" indicatorClassName={c.forecastRate != null && c.forecastRate < 90 ? "bg-amber-500" : undefined} />
                    <span className="w-28 text-right text-xs tabular-nums">
                      {c.forecastRate != null ? (
                        <>
                          <span className="font-semibold">{c.forecastRate}%</span>
                          <span className="text-muted-foreground"> {formatOku(c.forecastJpy)}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <MonthStrip r={r} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
