import Link from "next/link";
import { listMeetings } from "@/server/meetings";
import { remainingLabel } from "@/lib/meetings";
import { formatDate } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// 全院（見られる院）の議事録の提出待ち・期限超過
export async function PendingMinutes() {
  const rows = (await listMeetings()).filter((m) => m.status === "awaiting_minutes" || m.status === "overdue").sort((a, b) => a.held_on.localeCompare(b.held_on));
  const overdue = rows.filter((m) => m.status === "overdue").length;
  return (
    <Card className={overdue ? "border-red-400" : ""}>
      <CardHeader><CardTitle>議事録の提出待ち（{rows.length}件{overdue ? `・うち期限超過 ${overdue}件` : ""}）</CardTitle><Link href="/meetings" className="text-sm font-bold text-brand-700">会議一覧 ›</Link></CardHeader>
      <CardContent>
        <ul className="divide-y divide-stone-100">
          {rows.slice(0, 10).map((m) => (
            <li key={m.id}><Link href={`/meetings/${m.id}`} className="flex flex-wrap items-center gap-2 py-2.5 text-sm hover:text-brand-700">
              {m.status === "overdue" ? <Badge tone="danger">期限超過</Badge> : <Badge tone="warn">未提出</Badge>}
              <b>{m.store_name}</b><span>{formatDate(m.held_on)} {m.title}</span>
              <span className={`ml-auto text-xs font-bold ${m.status === "overdue" ? "text-red-700" : "text-amber-700"}`}>{remainingLabel(m.minutes_due_at)}</span>
            </Link></li>
          ))}
          {rows.length === 0 ? <li className="py-2 text-sm text-stone-500">提出待ちはありません</li> : null}
        </ul>
      </CardContent>
    </Card>
  );
}
