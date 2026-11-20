import Link from "next/link";
import { STATUS_SHORT } from "@/lib/domain/status";
import type { ReservationStatus } from "@/lib/domain/types";
import type { AdminRow } from "@/lib/services/admin-queries";
import { formatRange, yen } from "@/lib/time";

const TONE: Record<ReservationStatus, string> = {
  draft: "border-line text-mist",
  pending_line: "border-[#e6d3b0] bg-[#fbf6ec] text-warn",
  pending_review: "border-ink bg-paper text-ink",
  confirmed: "border-[#c5d8cc] bg-[#f1f7f3] text-ok",
  change_proposed: "border-[#c9d3e6] bg-[#f2f5fb] text-[#2b4a7a]",
  cancelled: "border-line text-mist",
  expired: "border-line text-mist",
  completed: "border-line bg-stone text-ink-soft",
};

export function StatusBadge({ status }: { status: ReservationStatus }) {
  return <span className={`inline-block whitespace-nowrap border px-2 py-0.5 text-[11px] ${TONE[status]}`}>{STATUS_SHORT[status]}</span>;
}

export function NoticeBadge({ status }: { status: string }) {
  if (status === "failed") return <span className="border border-[#e4c3c3] bg-[#fbf1f1] px-2 py-0.5 text-[11px] text-ng">通知失敗</span>;
  if (status === "manual_required") return <span className="border border-[#e6d3b0] bg-[#fbf6ec] px-2 py-0.5 text-[11px] text-warn">手動送信待ち</span>;
  if (status === "sent") return <span className="px-2 py-0.5 text-[11px] text-mist">通知済み</span>;
  return null;
}

export function Card({ title, children, action }: { title?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border border-line bg-paper p-4">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="font-serif text-base tracking-[0.08em]">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function ReservationTable({ rows, empty = "該当する予約はありません。" }: { rows: AdminRow[]; empty?: string }) {
  if (rows.length === 0) return <p className="text-sm text-mist">{empty}</p>;
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-line text-left text-xs text-mist">
          <tr>
            <th className="px-2 py-2 font-normal">日時</th>
            <th className="px-2 py-2 font-normal">場所</th>
            <th className="px-2 py-2 font-normal">お名前</th>
            <th className="px-2 py-2 font-normal">メニュー</th>
            <th className="px-2 py-2 font-normal">状態</th>
            <th className="px-2 py-2 font-normal">予約番号</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-stone">
              <td className="whitespace-nowrap px-2 py-2 tabular-nums">
                <Link href={`/admin/reservations/${r.id}`} className="underline-offset-4 hover:underline">
                  {formatRange(r.start_at, r.end_at)}
                </Link>
              </td>
              <td className="px-2 py-2">{r.location_short}</td>
              <td className="px-2 py-2">{r.customer_name}</td>
              <td className="px-2 py-2">
                {r.service_snapshot.name} <span className="text-xs text-mist">{yen(r.service_snapshot.price_tax_included)}</span>
              </td>
              <td className="space-x-1 px-2 py-2">
                <StatusBadge status={r.status} />
                <NoticeBadge status={r.notice_status} />
              </td>
              <td className="px-2 py-2 font-mono text-xs">
                <Link href={`/admin/reservations/${r.id}`}>{r.code}</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
