import Link from "next/link";
import { EmptyState, PageHeader, Stat } from "@/components/page";
import { TaskRow, TASK_SELECT, type TaskListItem } from "@/components/task-row";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrgContext } from "@/lib/auth/context";
import { createClient } from "@/lib/db/server";
import { todayInTimeZone } from "@/lib/dates";

export const metadata = { title: "ダッシュボード" };

type Summary = {
  today: number;
  overdue: number;
  open: number;
  on_hold: number;
  done_month: number;
  customers: number;
  consent_unknown: number;
  revisit_month: number;
  stores: { id: string; name: string; today: number; overdue: number; open: number; done_month: number }[];
};

export default async function DashboardPage({ params }: PageProps<"/o/[orgSlug]/dashboard">) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  const today = todayInTimeZone(ctx.org.timezone);
  const supabase = await createClient();

  const [{ data: summaryData }, { data: tasks }] = await Promise.all([
    supabase.rpc("dashboard_summary", { p_org: ctx.org.id, p_as_of: today }),
    supabase
      .from("followup_tasks")
      .select(TASK_SELECT)
      .eq("organization_id", ctx.org.id)
      .eq("status", "open")
      .lte("due_on", today)
      .order("due_on")
      .order("priority")
      .limit(8),
  ]);
  const s = (summaryData ?? {}) as Summary;
  const base = `/o/${orgSlug}`;

  return (
    <>
      <PageHeader title="ダッシュボード" description={`今日：${today.replaceAll("-", "/")}`} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="今日のフォロー対象" value={s.today ?? 0} tone="primary" href={`${base}/tasks?tab=today`} />
        <Stat label="期限切れ" value={s.overdue ?? 0} tone={s.overdue ? "danger" : undefined} href={`${base}/tasks?tab=overdue`} />
        <Stat label="未対応" value={s.open ?? 0} href={`${base}/tasks?tab=open`} />
        <Stat label="今月の完了" value={s.done_month ?? 0} href={`${base}/tasks?tab=done`} />
        <Stat label="顧客数" value={s.customers ?? 0} href={`${base}/customers`} />
        <Stat label="今月の再来店確認" value={s.revisit_month ?? 0} />
      </div>
      {s.consent_unknown > 0 && (
        <p className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          連絡同意が未確認の顧客が {s.consent_unknown} 名います。連絡タスクの対象外になっています。
          <Link href={`${base}/customers?contact=unknown`} className="ml-1 font-semibold underline">
            確認する
          </Link>
        </p>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-base font-bold">今日・期限切れのタスク</h2>
        {tasks?.length ? (
          <ul className="grid gap-2">
            {(tasks as unknown as TaskListItem[]).map((t) => (
              <TaskRow key={t.id} task={t} today={today} orgSlug={orgSlug} showStore={ctx.accessibleStoreIds.length > 1} />
            ))}
          </ul>
        ) : (
          <EmptyState>今日対応が必要なタスクはありません。</EmptyState>
        )}
        <Link href={`${base}/tasks`} className="mt-2 inline-block text-sm font-semibold text-primary">
          すべてのタスクを見る
        </Link>
      </section>

      {s.stores?.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>店舗別の対応状況</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-semibold">店舗</th>
                  <th className="py-1 text-right font-semibold">今日</th>
                  <th className="py-1 text-right font-semibold">期限切れ</th>
                  <th className="py-1 text-right font-semibold">未対応</th>
                  <th className="py-1 text-right font-semibold">今月完了</th>
                </tr>
              </thead>
              <tbody>
                {s.stores
                  .filter((st) => ctx.accessibleStoreIds.includes(st.id))
                  .map((st) => (
                    <tr key={st.id} className="border-t">
                      <td className="py-2 font-semibold">{st.name}</td>
                      <td className="py-2 text-right tabular-nums">{st.today}</td>
                      <td className={`py-2 text-right tabular-nums ${st.overdue ? "font-bold text-danger" : ""}`}>{st.overdue}</td>
                      <td className="py-2 text-right tabular-nums">{st.open}</td>
                      <td className="py-2 text-right tabular-nums">{st.done_month}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
