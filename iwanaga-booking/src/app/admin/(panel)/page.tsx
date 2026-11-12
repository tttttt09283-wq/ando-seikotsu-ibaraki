import Link from "next/link";
import ActionForm from "@/components/admin/ActionForm";
import { Card, ReservationTable } from "@/components/admin/parts";
import { requireAdminPage } from "@/lib/auth/admin";
import { getRepo } from "@/lib/repo";
import { dashboard, listForAdmin, rangeFor } from "@/lib/services/admin-queries";
import { expireHolds } from "@/lib/services/reservations";
import { formatJst } from "@/lib/time";
import { markNotificationsReadAction } from "../actions";

const RANGES = { today: "今日", week: "今週", month: "今月" } as const;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const admin = await requireAdminPage();
  const repo = getRepo();
  const now = new Date();
  await expireHolds(repo, now); // 期限切れのホールドをここでも解放
  const sp = await searchParams;
  const range = (sp.range && sp.range in RANGES ? sp.range : "today") as keyof typeof RANGES;
  const d = await dashboard(repo, admin, now);
  const list = await listForAdmin(repo, admin, { ...rangeFor(range, now), limit: 500 });

  const tiles = [
    { label: "LINE未確認", value: d.counts.pending_line, href: "/admin/reservations?status=pending_line", hint: "フォーム送信済み・LINE送信待ち" },
    { label: "確認待ち（仮予約）", value: d.counts.pending_review, href: "/admin/reservations?status=pending_review", hint: "LINE受付確認済み・承認待ち" },
    { label: "変更提案中", value: d.counts.change_proposed, href: "/admin/reservations?status=change_proposed", hint: "お客様の返信待ち" },
    { label: "確定済み（今後）", value: d.counts.confirmed, href: "/admin/reservations?status=confirmed", hint: "" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="border border-line bg-paper p-4 hover:border-ink">
            <p className="text-xs text-mist">{t.label}</p>
            <p className="mt-1 font-serif text-3xl tabular-nums">{t.value}</p>
            {t.hint && <p className="mt-1 text-[11px] text-mist">{t.hint}</p>}
          </Link>
        ))}
      </div>

      {d.failedNotices.length > 0 && (
        <Card title="通知の対応が必要な予約">
          <ReservationTable rows={d.failedNotices} />
        </Card>
      )}

      {d.unread.length > 0 && (
        <Card title={`新しいお知らせ（${d.unread.length}）`} action={<div className="w-32"><ActionForm action={markNotificationsReadAction} label="既読にする" confirm={false} /></div>}>
          <ul className="divide-y divide-line text-sm">
            {d.unread.slice(0, 20).map((n) => (
              <li key={n.id} className="flex justify-between gap-3 py-2">
                <span>{n.reservation_id ? <Link href={`/admin/reservations/${n.reservation_id}`} className="underline-offset-4 hover:underline">{n.summary}</Link> : n.summary}</span>
                <span className="shrink-0 text-xs text-mist">{formatJst(n.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="確定前の予約（期限の近い順）">
        <ReservationTable rows={[...d.pending].sort((a, b) => (a.hold_expires_at ?? "").localeCompare(b.hold_expires_at ?? ""))} empty="確定前の予約はありません。" />
      </Card>

      <Card
        title="予約一覧"
        action={
          <div className="flex gap-1 text-xs">
            {Object.entries(RANGES).map(([k, v]) => (
              <Link key={k} href={`/admin?range=${k}`} className={`border px-3 py-1 ${range === k ? "border-ink bg-ink text-paper" : "border-line"}`}>
                {v}
              </Link>
            ))}
          </div>
        }
      >
        <ReservationTable rows={list} />
      </Card>
    </div>
  );
}
