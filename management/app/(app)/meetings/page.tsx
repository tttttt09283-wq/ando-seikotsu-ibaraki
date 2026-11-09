import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canAnywhere } from "@/server/session";
import { listMeetings, storesWith } from "@/server/meetings";
import { MEETING_STATUS, meetingStatusLabel, remainingLabel } from "@/lib/meetings";
import { formatDate } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/flash";
import type { MeetingRow } from "@/server/meetings";

export const metadata: Metadata = { title: "院内会議" };

function Row({ m }: { m: MeetingRow }) {
  const st = MEETING_STATUS[m.status];
  return (
    <li>
      <Link href={`/meetings/${m.id}`} className="flex flex-wrap items-center gap-2 px-4 py-3 hover:bg-stone-50">
        <b>{formatDate(m.held_on)}</b><span>{m.title}</span><span className="text-sm text-stone-600">{m.store_name ?? "院が未設定"}</span>
        {m.has_draft && !m.minutes_submitted_at ? <Badge tone="brand">下書きあり</Badge> : null}
        {m.decision_count ? <span className="text-xs text-stone-500">決定事項 {m.decision_count}件（未完了 {m.open_decisions}）</span> : null}
        <span className="ml-auto flex items-center gap-2">
          {m.status === "awaiting_minutes" || m.status === "overdue" ? <span className={`text-xs font-bold ${m.status === "overdue" ? "text-red-700" : "text-amber-700"}`}>{remainingLabel(m.minutes_due_at)}</span> : null}
          <Badge tone={m.submitted_late ? "warn" : st.tone}>{meetingStatusLabel(m.status, m.submitted_late)}</Badge>
        </span>
      </Link>
    </li>
  );
}

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ store?: string; ok?: string; err?: string }> }) {
  const [canManage, canView] = await Promise.all([canAnywhere("meeting.manage"), canAnywhere("staff.view.store")]);
  const sp = await searchParams;
  const storeId = sp.store && /^[0-9a-f-]{36}$/.test(sp.store) ? sp.store : undefined;
  const [rows, manageable] = await Promise.all([listMeetings({ storeId }), canManage ? storesWith("meeting.manage") : Promise.resolve([])]);
  if (!canManage && !canView && rows.length === 0) notFound();
  const todo = rows.filter((m) => m.status === "awaiting_minutes" || m.status === "overdue").sort((a, b) => a.held_on.localeCompare(b.held_on));
  const upcoming = rows.filter((m) => m.status === "scheduled").sort((a, b) => a.held_on.localeCompare(b.held_on));
  const done = rows.filter((m) => m.status === "submitted" || m.status === "exempt");
  const stores = [...new Map(rows.filter((m) => m.store_id).map((m) => [m.store_id!, m.store_name!])).entries()];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black text-brand-800">院内会議・議事録</h1>
        {manageable.length ? <Button asChild><Link href="/meetings/new">＋ 会議を登録</Link></Button> : null}
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <p className="text-sm text-stone-600">議事録の提出期限は<b>開催日の3日後の23:59（日本時間）</b>です。会議は議事録の正式提出で完了になります。POSで登録した会議も表示されます。</p>
      {stores.length > 1 || storeId ? (
        <nav className="flex flex-wrap gap-1 text-sm">
          <Link href="/meetings" className={`rounded-full border px-3 py-1 ${!storeId ? "border-brand-700 bg-brand-50 font-bold" : "border-stone-300"}`}>すべて</Link>
          {stores.map(([id, name]) => <Link key={id} href={`/meetings?store=${id}`} className={`rounded-full border px-3 py-1 ${storeId === id ? "border-brand-700 bg-brand-50 font-bold" : "border-stone-300"}`}>{name}</Link>)}
        </nav>
      ) : null}
      <Card className={todo.some((m) => m.status === "overdue") ? "border-red-400" : todo.length ? "border-amber-400" : ""}>
        <CardHeader><CardTitle>議事録の提出が必要（{todo.length}件）</CardTitle></CardHeader>
        <CardContent className="p-0"><ul className="divide-y divide-stone-100">{todo.map((m) => <Row key={m.id} m={m} />)}{todo.length === 0 ? <li className="px-4 py-4 text-sm text-stone-500">ありません</li> : null}</ul></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>開催予定（{upcoming.length}件）</CardTitle></CardHeader>
        <CardContent className="p-0"><ul className="divide-y divide-stone-100">{upcoming.map((m) => <Row key={m.id} m={m} />)}{upcoming.length === 0 ? <li className="px-4 py-4 text-sm text-stone-500">ありません</li> : null}</ul></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>提出済み・過去の会議</CardTitle></CardHeader>
        <CardContent className="p-0"><ul className="divide-y divide-stone-100">{done.slice(0, 50).map((m) => <Row key={m.id} m={m} />)}{done.length === 0 ? <li className="px-4 py-4 text-sm text-stone-500">ありません</li> : null}</ul></CardContent>
      </Card>
    </>
  );
}
