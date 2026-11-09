import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canAnywhere } from "@/server/session";
import { listHolidayChanges, HC_STATUS } from "@/server/holiday-change";
import { hhmm } from "@/lib/part-time";
import { formatDate } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "振休→アルバイト勤務" };

export default async function HolidayChangeListPage() {
  const [canRequest, canGm, canFinal, canView] = await Promise.all([
    canAnywhere("holidaychange.request"), canAnywhere("holidaychange.gm_review"), canAnywhere("holidaychange.final_approve"), canAnywhere("staff.view.store"),
  ]);
  if (!canRequest && !canGm && !canFinal && !canView) notFound();
  const rows = await listHolidayChanges();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black text-brand-800">振休→アルバイト勤務の変更</h1>
        {canRequest ? <Button asChild><Link href="/holiday-change/new">＋ 変更を申請</Link></Button> : null}
      </div>
      <p className="text-sm text-stone-600">取得予定の振休を、アルバイトとしての勤務に変える申請です。GMの確認 → 社長の承認で確定し、その振休は「使ったこと」になります（残数には戻りません）。</p>
      <Card>
        <CardHeader><CardTitle>申請（新しい日付順）</CardTitle></CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-stone-100">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/holiday-change/${r.id}`} className="flex flex-wrap items-center gap-2 px-4 py-3 hover:bg-stone-50">
                  <b>{formatDate(r.shift_holiday_date)}</b><span className="text-sm">{hhmm(r.start_time)}〜{hhmm(r.end_time)}</span>
                  <span className="text-sm">{r.target?.name}さん</span>
                  <span className="text-sm text-stone-600">{r.stores?.name}</span>
                  <span className="ml-auto"><Badge tone={HC_STATUS[r.status].tone}>{HC_STATUS[r.status].text}</Badge></span>
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
