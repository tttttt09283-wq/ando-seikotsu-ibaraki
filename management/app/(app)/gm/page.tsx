import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/server/session";
import { holidayChangeQueue } from "@/server/holiday-change";
import { PendingMinutes } from "@/components/pending-minutes";
import { hhmm } from "@/lib/part-time";
import { formatDate } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StoreOverview } from "@/components/store-overview";
import { PhaseNote } from "@/components/phase-note";

export const metadata: Metadata = { title: "GMダッシュボード" };

export default async function GmPage() {
  if (!(await can("dashboard.gm"))) notFound();
  const hc = (await holidayChangeQueue()).filter((q) => q.step_kind === "gm_review");
  return (
    <>
      <h1 className="text-xl font-black text-brand-800">GMダッシュボード</h1>
      <Card className={hc.length ? "border-brand-600" : ""}>
        <CardHeader><CardTitle>振休→アルバイト勤務の確認待ち（{hc.length}件）</CardTitle><Button asChild size="sm"><Link href="/approvals">確認画面へ</Link></Button></CardHeader>
        <CardContent>
          <ul className="divide-y divide-stone-100">
            {hc.slice(0, 8).map((q) => (
              <li key={q.step_id}><Link href={`/holiday-change/${q.request_id}`} className="flex flex-wrap items-center gap-2 py-2.5 text-sm hover:text-brand-700">
                <b>{q.target_name}</b><span className="text-stone-500">{q.store_name}</span><span>{formatDate(q.shift_holiday_date)} {hhmm(q.start_time)}〜{hhmm(q.end_time)}</span>
              </Link></li>
            ))}
            {hc.length === 0 ? <li className="py-2 text-sm text-stone-500">確認待ちはありません</li> : null}
          </ul>
        </CardContent>
      </Card>
      <PendingMinutes />
      <PhaseNote phase="PHASE 9">議事録提出率・承認待ち・有給取得率・年5日未達見込みなど全院のKPIを表示します。</PhaseNote>
      <StoreOverview />
    </>
  );
}
