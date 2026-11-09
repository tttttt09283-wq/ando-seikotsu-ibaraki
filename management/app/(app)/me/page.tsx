import type { Metadata } from "next";
import Link from "next/link";
import { requireMe } from "@/server/session";
import { getLeaveOverview } from "@/server/leave";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RoleList } from "@/components/role-list";
import { PaidCard, ShiftCard, FiveDayCard } from "@/components/leave-cards";
import { UnacknowledgedRules } from "@/components/unacknowledged-rules";
import { myTasks } from "@/server/meetings";
import { TASK_STATUS, isTaskOverdue } from "@/lib/meetings";
import { formatDate, jstToday } from "@/lib/time";

export const metadata: Metadata = { title: "マイページ" };

export default async function MyPage({ searchParams }: { searchParams: Promise<{ pw?: string }> }) {
  const me = await requireMe();
  const { pw } = await searchParams;
  const [leave, tasks] = await Promise.all([getLeaveOverview(me.id), myTasks()]);
  const today = jstToday();
  const openTasks = tasks.filter((t) => t.status !== "done");
  return (
    <>
      <h1 className="text-xl font-black text-brand-800">マイページ</h1>
      {pw === "changed" ? <Alert tone="ok">PASSを変更しました。</Alert> : null}
      <UnacknowledgedRules />
      <div className="grid gap-4 md:grid-cols-2">
        <PaidCard b={leave.balances.PAID} />
        <ShiftCard shift={leave.balances.SHIFT} holiday={leave.balances.SHIFT_HOLIDAY} />
        <FiveDayCard f={leave.fiveDay} />
      </div>
      <div><Button asChild variant="outline"><Link href={`/staff/${me.id}/leave`}>付与ごとの明細・有効期限を見る</Link></Button></div>
      <div className="flex flex-wrap gap-2"><Button asChild><Link href="/leave/new">有給・振休を申請</Link></Button><Button asChild variant="outline"><Link href="/leave">申請の状況</Link></Button></div>
      <Card>
        <CardHeader><CardTitle>自分のタスク（未完了 {openTasks.length}件）</CardTitle><Link href="/tasks" className="text-sm font-bold text-brand-700">タスク ›</Link></CardHeader>
        <CardContent>
          <ul className="divide-y divide-stone-100">
            {openTasks.slice(0, 5).map((t) => (
              <li key={t.id}><Link href="/tasks" className="flex flex-wrap items-center gap-2 py-2.5 text-sm hover:text-brand-700">
                <b>{t.title}</b><span className="text-xs text-stone-500">{TASK_STATUS[t.status]}{t.status === "doing" ? ` ${t.progress}%` : ""}</span>
                <span className={`ml-auto text-xs ${isTaskOverdue(t.due_date, t.status, today) ? "font-bold text-red-700" : "text-stone-500"}`}>期限 {formatDate(t.due_date)}{isTaskOverdue(t.due_date, t.status, today) ? "（期限切れ）" : ""}</span>
              </Link></li>
            ))}
            {openTasks.length === 0 ? <li className="py-2 text-sm text-stone-500">未完了のタスクはありません</li> : null}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{me.name} さん</CardTitle><Button asChild size="sm" variant="outline"><Link href="/account/password">PASSを変更</Link></Button></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5">
            <dt className="text-stone-500">ログインID</dt><dd className="font-mono">{me.login_id}</dd>
            <dt className="text-stone-500">スタッフID</dt><dd className="font-mono">{me.staff_code}</dd>
          </dl>
          <div><p className="mb-1.5 text-stone-500">役職・所属</p><RoleList me={me} /></div>
        </CardContent>
      </Card>
    </>
  );
}
