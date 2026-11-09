import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/server/session";
import { getStoreLeave } from "@/server/leave";
import { approvalQueue, listRequests } from "@/server/requests";
import { listPartTime } from "@/server/part-time";
import { listHolidayChanges, HC_STATUS } from "@/server/holiday-change";
import { listMeetings, storeTasks } from "@/server/meetings";
import { MEETING_STATUS, meetingStatusLabel, remainingLabel } from "@/lib/meetings";
import { CATEGORY_SHORT, hhmm } from "@/lib/part-time";
import { formatDate as fmtD } from "@/lib/time";
import { formatDates, KIND_LABEL } from "@/lib/leave/requests";
import { RequestStatusBadge } from "@/components/request-status";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL, type RoleCode } from "@/lib/roles";
import { fmtDays, FIVE_DAY_LABEL } from "@/lib/leave/types";
import { formatDate } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "院長ダッシュボード" };

export default async function StorePage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(storeId) || !(await can("staff.view.store", storeId))) notFound();
  const supabase = await createClient();
  const { data: store } = await supabase.from("stores").select("name").eq("id", storeId).single();
  if (!store) notFound();
  const [rows, queue, requests, partTime, canPt, hcRows, canHc] = await Promise.all([getStoreLeave(storeId), approvalQueue(), listRequests({ storeId, limit: 10 }), listPartTime({ storeId, limit: 10 }), can("parttime.request", storeId),
    listHolidayChanges({ storeId, limit: 10 }), can("holidaychange.request", storeId)]);
  const [meetings, canMeeting, canTask] = await Promise.all([listMeetings({ storeId }), can("meeting.manage", storeId), can("task.manage.store", storeId)]);
  const tasks = canTask ? await storeTasks(storeId) : [];
  const openTasks = tasks.filter((t) => t.status !== "done");
  const overdueTasks = openTasks.filter((t) => t.due_date && t.due_date < new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10));
  const pendingMinutes = meetings.filter((m) => m.status === "awaiting_minutes" || m.status === "overdue");
  const upcomingMeetings = meetings.filter((m) => m.status === "scheduled").reverse().slice(0, 5);
  const shiftQueue = queue.filter((q) => q.kind === "SHIFT" && q.store_name === store.name);
  const overdue = rows.filter((r) => r.shift.overdue + r.shift_holiday.overdue > 0);
  const fiveDayAlerts = rows.filter((r) => r.five_day.target && ["caution", "warning", "urgent"].includes(r.five_day.level));
  return (
    <>
      <h1 className="text-xl font-black text-brand-800">{store.name}</h1>
      {overdue.length ? (
        <Alert tone="danger"><b>期限切れの振休：</b>{overdue.map((r) => `${r.name}さん ${fmtDays(r.shift.overdue + r.shift_holiday.overdue)}`).join("、")}（出勤した月の末日を過ぎています）</Alert>
      ) : null}
      {fiveDayAlerts.length ? (
        <Alert tone="warn"><b>有給の年5日：</b>{fiveDayAlerts.map((r) => `${r.name}さん（${r.five_day.target ? `あと${fmtDays(r.five_day.remaining_required)}・期限${formatDate(r.five_day.period_end)}` : ""}）`).join("、")}</Alert>
      ) : null}
      {shiftQueue.length ? (
        <Card className="border-brand-600">
          <CardHeader><CardTitle>振休の承認待ち（{shiftQueue.length}件）</CardTitle><Button asChild size="sm"><Link href="/approvals">承認する</Link></Button></CardHeader>
          <CardContent>
            <ul className="divide-y divide-stone-100 text-sm">
              {shiftQueue.map((q) => <li key={q.step_id} className="py-2"><Link href={`/leave/${q.request_id}`} className="hover:text-brand-700"><b>{q.user_name}</b>　{formatDates(q.dates)}（{q.total_days}日）{q.self_approval ? "・ご自身" : ""}</Link></li>)}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><CardTitle>スタッフ別の残数（{rows.length}名）</CardTitle><span className="text-xs text-stone-500">名前を押すと明細</span></CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-stone-100">
            {rows.map((r) => {
              const shiftTotal = r.shift.current + r.shift_holiday.current;
              const shiftOver = r.shift.overdue + r.shift_holiday.overdue;
              const f = r.five_day.target ? FIVE_DAY_LABEL[r.five_day.level] : null;
              return (
                <li key={r.user_id}>
                  <Link href={`/staff/${r.user_id}/leave`} className="grid gap-1.5 px-4 py-3 hover:bg-stone-50 sm:grid-cols-[1fr_auto] sm:items-center">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <b>{r.name}</b>
                      <Badge tone={r.role_code === "MANAGER" ? "brand" : "neutral"}>{ROLE_LABEL[r.role_code as RoleCode] ?? r.role_code}</Badge>
                      {f ? <Badge tone={f.tone}>年5日：{f.text}</Badge> : null}
                    </span>
                    <span className="flex flex-wrap gap-3 text-sm tabular-nums">
                      <span>有給 <b className="text-base">{fmtDays(r.paid.current)}</b>{r.paid.planned ? <span className="text-xs text-stone-500">（予定{fmtDays(r.paid.planned)}）</span> : null}</span>
                      <span className={shiftOver ? "text-red-700" : ""}>振休 <b className="text-base">{fmtDays(shiftTotal)}</b>{shiftOver ? "（期限切れあり）" : r.shift.next_expiry_date || r.shift_holiday.next_expiry_date ? <span className="text-xs text-stone-500">（月末まで）</span> : null}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
            {rows.length === 0 ? <li className="px-4 py-6 text-center text-sm text-stone-500">在籍スタッフがいません</li> : null}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>最近の休暇申請</CardTitle><Link href="/leave" className="text-sm font-bold text-brand-700">すべて ›</Link></CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-stone-100 text-sm">
            {requests.map((r) => (
              <li key={r.id}><Link href={`/leave/${r.id}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5 hover:bg-stone-50">
                <Badge tone={r.kind === "PAID" ? "brand" : "neutral"}>{KIND_LABEL[r.kind]}</Badge><b>{r.users?.name}</b><span>{formatDates(r.dates)}</span><span className="ml-auto"><RequestStatusBadge status={r.status} /></span>
              </Link></li>
            ))}
            {requests.length === 0 ? <li className="px-4 py-4 text-stone-500">まだありません</li> : null}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>アルバイト勤務の申請</CardTitle>{canPt ? <Button asChild size="sm"><Link href="/part-time/new">＋ 申請</Link></Button> : null}</CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-stone-100 text-sm">
            {partTime.map((r) => (
              <li key={r.id}><Link href={`/part-time/${r.id}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5 hover:bg-stone-50">
                <b>{fmtD(r.work_date)}</b><span>{hhmm(r.start_time)}〜{hhmm(r.end_time)}</span><Badge tone={r.category === "help" ? "danger" : "neutral"}>{CATEGORY_SHORT[r.category]}</Badge>
                <span>{r.worker?.name ?? "勤務者未定"}</span><span className="ml-auto"><RequestStatusBadge status={r.status} /></span>
              </Link></li>
            ))}
            {partTime.length === 0 ? <li className="px-4 py-4 text-stone-500">まだありません</li> : null}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>振休→アルバイト勤務の変更</CardTitle>{canHc ? <Button asChild size="sm"><Link href="/holiday-change/new">＋ 申請</Link></Button> : null}</CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-stone-100 text-sm">
            {hcRows.map((r) => (
              <li key={r.id}><Link href={`/holiday-change/${r.id}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5 hover:bg-stone-50">
                <b>{fmtD(r.shift_holiday_date)}</b><span>{hhmm(r.start_time)}〜{hhmm(r.end_time)}</span><span>{r.target?.name}</span>
                <span className="ml-auto"><Badge tone={HC_STATUS[r.status].tone}>{HC_STATUS[r.status].text}</Badge></span>
              </Link></li>
            ))}
            {hcRows.length === 0 ? <li className="px-4 py-4 text-stone-500">まだありません</li> : null}
          </ul>
        </CardContent>
      </Card>
      <Card className={pendingMinutes.some((m) => m.status === "overdue") ? "border-red-400" : pendingMinutes.length ? "border-amber-400" : ""}>
        <CardHeader><CardTitle>会議・議事録</CardTitle>{canMeeting ? <Button asChild size="sm"><Link href="/meetings/new">＋ 会議を登録</Link></Button> : null}</CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-stone-100 text-sm">
            {[...pendingMinutes, ...upcomingMeetings].map((m) => (
              <li key={m.id}><Link href={`/meetings/${m.id}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5 hover:bg-stone-50">
                <b>{fmtD(m.held_on)}</b><span>{m.title}</span>
                {m.status !== "scheduled" ? <span className={`text-xs font-bold ${m.status === "overdue" ? "text-red-700" : "text-amber-700"}`}>{remainingLabel(m.minutes_due_at)}</span> : null}
                <span className="ml-auto"><Badge tone={MEETING_STATUS[m.status].tone}>{meetingStatusLabel(m.status, m.submitted_late)}</Badge></span>
              </Link></li>
            ))}
            {pendingMinutes.length + upcomingMeetings.length === 0 ? <li className="px-4 py-4 text-stone-500">提出待ち・予定の会議はありません</li> : null}
          </ul>
        </CardContent>
      </Card>
      {canTask ? (
        <Card className={overdueTasks.length ? "border-red-300" : ""}>
          <CardHeader><CardTitle>院のタスク（未完了 {openTasks.length}件{overdueTasks.length ? `・期限切れ ${overdueTasks.length}件` : ""}）</CardTitle><Button asChild size="sm" variant="outline"><Link href={`/tasks?store=${storeId}`}>タスク管理</Link></Button></CardHeader>
        </Card>
      ) : null}
    </>
  );
}
