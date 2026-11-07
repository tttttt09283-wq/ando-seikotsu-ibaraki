import type { Metadata } from "next";
import Link from "next/link";
import { requireMe } from "@/server/session";
import { listRequests } from "@/server/requests";
import { KIND_LABEL, formatDates } from "@/lib/leave/requests";
import { formatJstDateTime } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RequestStatusBadge } from "@/components/request-status";

export const metadata: Metadata = { title: "休暇の申請" };

export default async function LeaveListPage() {
  const me = await requireMe();
  const rows = await listRequests({ limit: 100 });
  const mine = rows.filter((r) => r.user_id === me.id || r.submitted_by === me.id);
  const others = rows.filter((r) => r.user_id !== me.id && r.submitted_by !== me.id);
  const List = ({ list }: { list: typeof rows }) => (
    <ul className="divide-y divide-stone-100">
      {list.map((r) => (
        <li key={r.id}>
          <Link href={`/leave/${r.id}`} className="flex flex-wrap items-center gap-2 px-4 py-3 hover:bg-stone-50">
            <Badge tone={r.kind === "PAID" ? "brand" : "neutral"}>{KIND_LABEL[r.kind]}</Badge>
            <b>{formatDates(r.dates)}</b><span className="text-sm text-stone-500">{r.total_days}日</span>
            {r.user_id !== me.id ? <span className="text-sm">{r.users?.name}さん</span> : null}
            {r.balance_shortage ? <Badge tone="danger">残数不足</Badge> : null}
            <span className="ml-auto flex items-center gap-2"><RequestStatusBadge status={r.status} /><span className="hidden text-xs text-stone-500 sm:inline">{formatJstDateTime(r.created_at)}</span></span>
          </Link>
        </li>
      ))}
      {list.length === 0 ? <li className="px-4 py-6 text-center text-sm text-stone-500">ありません</li> : null}
    </ul>
  );
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black text-brand-800">休暇の申請</h1>
        <Button asChild><Link href="/leave/new">＋ 有給・振休を申請</Link></Button>
      </div>
      <Card><CardHeader><CardTitle>自分の申請</CardTitle></CardHeader><CardContent className="p-0"><List list={mine} /></CardContent></Card>
      {others.length ? <Card><CardHeader><CardTitle>担当している院の申請（閲覧）</CardTitle></CardHeader><CardContent className="p-0"><List list={others} /></CardContent></Card> : null}
    </>
  );
}
