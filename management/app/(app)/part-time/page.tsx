import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canAnywhere } from "@/server/session";
import { listPartTime } from "@/server/part-time";
import { CATEGORY_SHORT, hhmm } from "@/lib/part-time";
import { formatDate } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RequestStatusBadge } from "@/components/request-status";

export const metadata: Metadata = { title: "アルバイト勤務" };

export default async function PartTimeListPage() {
  const [canRequest, canApprove, canView] = await Promise.all([canAnywhere("parttime.request"), canAnywhere("parttime.final_approve"), canAnywhere("staff.view.store")]);
  if (!canRequest && !canApprove && !canView) notFound();
  const rows = await listPartTime();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black text-brand-800">アルバイト勤務</h1>
        {canRequest ? <Button asChild><Link href="/part-time/new">＋ 勤務を申請</Link></Button> : null}
      </div>
      <Card>
        <CardHeader><CardTitle>申請（新しい勤務日順）</CardTitle></CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-stone-100">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/part-time/${r.id}`} className="flex flex-wrap items-center gap-2 px-4 py-3 hover:bg-stone-50">
                  <b>{formatDate(r.work_date)}</b><span className="text-sm">{hhmm(r.start_time)}〜{hhmm(r.end_time)}</span>
                  <span className="text-sm text-stone-600">{r.stores?.name}</span>
                  <Badge tone={r.category === "help" ? "danger" : "neutral"}>{CATEGORY_SHORT[r.category]}</Badge>
                  {r.is_exception ? <Badge tone="warn">シフト確定後</Badge> : null}
                  <span className="text-sm">{r.worker?.name ?? "勤務者未定"}</span>
                  <span className="ml-auto"><RequestStatusBadge status={r.status} /></span>
                </Link>
              </li>
            ))}
            {rows.length === 0 ? <li className="px-4 py-6 text-center text-sm text-stone-500">まだありません</li> : null}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
