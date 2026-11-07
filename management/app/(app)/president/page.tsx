import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/server/session";
import { approvalQueue } from "@/server/requests";
import { formatDates, KIND_LABEL } from "@/lib/leave/requests";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PhaseNote } from "@/components/phase-note";

export const metadata: Metadata = { title: "社長ダッシュボード" };

export default async function PresidentPage() {
  if (!(await can("dashboard.president"))) notFound();
  const queue = await approvalQueue();
  const paid = queue.filter((q) => q.kind === "PAID");
  return (
    <>
      <h1 className="text-xl font-black text-brand-800">社長ダッシュボード</h1>
      <Card className={paid.length ? "border-brand-600" : ""}>
        <CardHeader><CardTitle>有給の承認待ち（{paid.length}件）</CardTitle><Button asChild size="sm"><Link href="/approvals">承認画面へ</Link></Button></CardHeader>
        <CardContent>
          <ul className="divide-y divide-stone-100">
            {paid.slice(0, 8).map((q) => (
              <li key={q.step_id}><Link href={`/leave/${q.request_id}`} className="flex flex-wrap items-center gap-2 py-2.5 text-sm hover:text-brand-700">
                <Badge tone="brand">{KIND_LABEL[q.kind]}</Badge><b>{q.user_name}</b><span className="text-stone-500">{q.store_name}</span>
                <span>{formatDates(q.dates)}（{q.total_days}日）</span>{q.balance_shortage ? <Badge tone="danger">残数不足</Badge> : null}
              </Link></li>
            ))}
            {paid.length === 0 ? <li className="py-2 text-sm text-stone-500">承認待ちはありません</li> : null}
          </ul>
        </CardContent>
      </Card>
      <PhaseNote phase="PHASE 5〜8">アルバイト勤務・振休からの勤務変更・社内規定の承認待ちもここに加わります。</PhaseNote>
      <Card>
        <CardHeader><CardTitle>管理</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild><Link href="/admin/users">スタッフ・ID/PASSの管理</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/stores">店舗・エリアの管理</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/leave">有給の付与予定</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/import">CSV取り込み（初期移行）</Link></Button>
        </CardContent>
      </Card>
    </>
  );
}
