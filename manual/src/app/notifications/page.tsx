import Link from "next/link";
import { readAllNotifications } from "@/app/actions";
import { Shell } from "@/components/Shell";
import { Badge, btnGhost, Card, Empty, fmtDateTime, PageTitle } from "@/components/ui";
import { requireActor } from "@/lib/auth";
import { sql } from "@/lib/db";

export const metadata = { title: "通知" };

export default async function NotificationsPage() {
  const actor = await requireActor();
  const rows = await sql()<{ id: string; kind: string; title: string; link: string; read_at: Date | null; created_at: Date }[]>`
    select id, kind, title, link, read_at, created_at from mn_notifications where member_id = ${actor.memberId} order by created_at desc limit 100`;
  return (
    <Shell actor={actor} active="notifications">
      <PageTitle title="通知" lead="ルールの確認のお願いは、そのルールで「確認しました」を押すと消えます。">
        <form action={readAllNotifications}><button className={btnGhost}>確認以外を既読にする</button></form>
      </PageTitle>
      <Card>
        {rows.length ? (
          <ul>
            {rows.map((n) => (
              <li key={n.id} className="border-b border-neutral-100 last:border-0">
                <Link href={n.link} className={`flex items-start justify-between gap-2 py-3 ${n.read_at ? "text-neutral-500" : ""}`}>
                  <span className="text-sm font-bold">{n.title}</span>
                  <span className="flex shrink-0 flex-col items-end gap-1 text-xs">
                    {!n.read_at && <Badge tone="red">{n.kind === "ack" ? "要確認" : "未読"}</Badge>}
                    {fmtDateTime(n.created_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>通知はありません</Empty>
        )}
      </Card>
    </Shell>
  );
}
