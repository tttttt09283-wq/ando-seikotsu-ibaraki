import { PageHeader, Stat } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getOrgContext, requirePermission, storeIdsWith } from "@/lib/auth/context";
import { createClient } from "@/lib/db/server";
import { addDays, isIsoDate, monthStart, todayInTimeZone } from "@/lib/dates";

export const metadata = { title: "分析" };

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : "—");

export default async function AnalyticsPage({ params, searchParams }: PageProps<"/o/[orgSlug]/analytics">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await getOrgContext(orgSlug);
  requirePermission(ctx, "analytics.view");
  const today = todayInTimeZone(ctx.org.timezone);
  const from = typeof sp.from === "string" && isIsoDate(sp.from) ? sp.from : monthStart(today);
  const toRaw = typeof sp.to === "string" && isIsoDate(sp.to) ? sp.to : today;
  const to = toRaw < from ? from : toRaw > addDays(from, 366) ? addDays(from, 366) : toRaw;

  const supabase = await createClient();
  const { data } = await supabase.rpc("analytics_summary", { p_org: ctx.org.id, p_from: from, p_to: to, p_as_of: today });
  const visible = storeIdsWith(ctx, "analytics.view");
  const rows = (data ?? []).filter((r) => visible.includes(r.store_id));
  const sum = (k: keyof (typeof rows)[number]) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  const target = sum("target_count");
  const done = sum("done_count");
  const na = sum("not_applicable_count");

  return (
    <>
      <PageHeader title="分析" />
      <form className="mb-4 flex flex-wrap items-end gap-2" action={`/o/${orgSlug}/analytics`}>
        <label className="grid gap-1 text-sm">
          期限日（から）
          <Input type="date" name="from" defaultValue={from} className="w-44" />
        </label>
        <label className="grid gap-1 text-sm">
          （まで）
          <Input type="date" name="to" defaultValue={to} className="w-44" />
        </label>
        <Button type="submit" variant="outline">
          表示
        </Button>
      </form>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="フォロー対象件数" value={target} />
        <Stat label="対応完了率" value={pct(done, target - na)} tone="primary" />
        <Stat label="期限超過（未対応）" value={sum("overdue_count")} tone={sum("overdue_count") ? "danger" : undefined} />
        <Stat label="対応済み" value={done} />
        <Stat label="予約確認数" value={sum("appointment_confirmed_count")} />
        <Stat label="再来店確認数" value={sum("revisit_confirmed_count")} />
      </div>

      <Card className="mt-4">
        <CardContent className="overflow-x-auto pt-4">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="mb-2 text-left font-bold">店舗別実績</caption>
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1">店舗</th>
                <th className="py-1 text-right">対象</th>
                <th className="py-1 text-right">完了</th>
                <th className="py-1 text-right">完了率</th>
                <th className="py-1 text-right">期限超過</th>
                <th className="py-1 text-right">予約確認</th>
                <th className="py-1 text-right">再来店確認</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.store_id} className="border-t">
                  <td className="py-2 font-semibold">{r.store_name}</td>
                  <td className="py-2 text-right tabular-nums">{r.target_count}</td>
                  <td className="py-2 text-right tabular-nums">{r.done_count}</td>
                  <td className="py-2 text-right tabular-nums">{pct(Number(r.done_count), Number(r.target_count) - Number(r.not_applicable_count))}</td>
                  <td className="py-2 text-right tabular-nums">{r.overdue_count}</td>
                  <td className="py-2 text-right tabular-nums">{r.appointment_confirmed_count}</td>
                  <td className="py-2 text-right tabular-nums">{r.revisit_confirmed_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="mt-4 rounded-md bg-info-soft p-3 text-xs leading-relaxed text-navy">
        <p className="font-bold">数値の定義</p>
        <ul className="mt-1 list-disc pl-4">
          <li>対象期間は、タスクの期限日が指定期間内のものです。</li>
          <li>完了率 ＝ 対応済み ÷（対象 − 対象外）。</li>
          <li>予約確認数・再来店確認数は、対応完了後30日以内に予約・来店の記録があった件数です。</li>
          <li>
            <strong>これらはフォロー施策によって予約・再来店が発生したことを示すものではありません。</strong>
            記録上の前後関係のみを集計しています。
          </li>
        </ul>
      </div>
    </>
  );
}
