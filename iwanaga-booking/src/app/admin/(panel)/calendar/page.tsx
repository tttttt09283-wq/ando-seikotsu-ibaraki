import Link from "next/link";
import { Card, StatusBadge } from "@/components/admin/parts";
import { requireAdminPage } from "@/lib/auth/admin";
import type { BlockedSlot } from "@/lib/domain/types";
import { getRepo } from "@/lib/repo";
import { listForAdmin, type AdminRow } from "@/lib/services/admin-queries";
import { addDaysToKey, formatJst, jstDateKey, jstDateTime, jstTime, jstWeekday } from "@/lib/time";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
type View = "month" | "week" | "day";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; all?: string }> }) {
  const admin = await requireAdminPage();
  const repo = getRepo();
  const sp = await searchParams;
  const view: View = sp.view === "week" || sp.view === "day" ? sp.view : "month";
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : jstDateKey(new Date());
  const showAll = sp.all === "1";

  let start: string, days: number;
  if (view === "day") {
    start = date;
    days = 1;
  } else if (view === "week") {
    start = addDaysToKey(date, -((jstWeekday(date) + 6) % 7));
    days = 7;
  } else {
    const first = `${date.slice(0, 7)}-01`;
    start = addDaysToKey(first, -((jstWeekday(first) + 6) % 7));
    days = 42;
  }
  const from = jstDateTime(start, "00:00").toISOString();
  const to = jstDateTime(addDaysToKey(start, days), "00:00").toISOString();
  const rows = (await listForAdmin(repo, admin, { from, to, limit: 2000 })).filter((r) => showAll || !["cancelled", "expired"].includes(r.status));
  const blocks = await repo.listBlocks(from, to);
  const byDay = new Map<string, AdminRow[]>();
  for (const r of rows) byDay.set(jstDateKey(r.start_at), [...(byDay.get(jstDateKey(r.start_at)) ?? []), r]);
  const blocksByDay = new Map<string, BlockedSlot[]>();
  for (const b of blocks) {
    for (let d = jstDateKey(b.start_at); d <= jstDateKey(new Date(new Date(b.end_at).getTime() - 1)); d = addDaysToKey(d, 1)) blocksByDay.set(d, [...(blocksByDay.get(d) ?? []), b]);
  }
  const locs = new Map((await repo.listLocations()).map((l) => [l.id, l.short_name]));

  const step = view === "day" ? 1 : view === "week" ? 7 : 0;
  const prev = view === "month" ? monthShift(date, -1) : addDaysToKey(date, -step);
  const next = view === "month" ? monthShift(date, 1) : addDaysToKey(date, step);
  const q = (v: View, d: string) => `/admin/calendar?view=${v}&date=${d}${showAll ? "&all=1" : ""}`;
  const today = jstDateKey(new Date());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={q(view, prev)} className="border border-line bg-paper px-3 py-1.5 text-sm">←</Link>
          <p className="font-serif text-lg tabular-nums">{view === "month" ? `${date.slice(0, 4)}年${Number(date.slice(5, 7))}月` : view === "week" ? `${formatJst(jstDateTime(start, "00:00"), false)}〜` : formatJst(jstDateTime(date, "00:00"), false)}</p>
          <Link href={q(view, next)} className="border border-line bg-paper px-3 py-1.5 text-sm">→</Link>
          <Link href={q(view, today)} className="px-2 text-xs text-mist underline">今日</Link>
        </div>
        <div className="flex gap-1 text-xs">
          {(["month", "week", "day"] as View[]).map((v) => (
            <Link key={v} href={q(v, date)} className={`border px-3 py-1.5 ${view === v ? "border-ink bg-ink text-paper" : "border-line bg-paper"}`}>
              {{ month: "月", week: "週", day: "日" }[v]}
            </Link>
          ))}
          <Link href={`/admin/calendar?view=${view}&date=${date}${showAll ? "" : "&all=1"}`} className="border border-line bg-paper px-3 py-1.5">
            {showAll ? "キャンセル等を隠す" : "キャンセル等も表示"}
          </Link>
        </div>
      </div>

      {view === "month" && (
        <div className="grid grid-cols-7 border-l border-t border-line bg-paper text-xs">
          {["月", "火", "水", "木", "金", "土", "日"].map((w) => <div key={w} className="border-b border-r border-line p-1 text-center text-mist">{w}</div>)}
          {Array.from({ length: 42 }, (_, i) => addDaysToKey(start, i)).map((d) => {
            const items = byDay.get(d) ?? [];
            const bl = blocksByDay.get(d) ?? [];
            const out = d.slice(0, 7) !== date.slice(0, 7);
            return (
              <Link key={d} href={q("day", d)} className={`min-h-20 border-b border-r border-line p-1 hover:bg-stone ${out ? "text-mist/60" : ""} ${d === today ? "bg-stone" : ""}`}>
                <span className="tabular-nums">{Number(d.slice(8))}</span>
                <div className="mt-1 space-y-0.5">
                  {items.slice(0, 3).map((r) => (
                    <p key={r.id} className="truncate">
                      <span className="tabular-nums">{jstTime(r.start_at)}</span> {r.location_short.slice(0, 2)}
                      <span className={r.status === "confirmed" ? "text-ok" : r.status === "pending_line" ? "text-warn" : ""}> ●</span>
                    </p>
                  ))}
                  {items.length > 3 && <p className="text-mist">他{items.length - 3}件</p>}
                  {bl.length > 0 && <p className="text-mist">ブロック{bl.length}</p>}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {view !== "month" && (
        <div className={`grid gap-3 ${view === "week" ? "md:grid-cols-7" : ""}`}>
          {Array.from({ length: days }, (_, i) => addDaysToKey(start, i)).map((d) => {
            const items = [
              ...(byDay.get(d) ?? []).map((r) => ({ t: r.start_at, el: <Item key={r.id} r={r} /> })),
              ...(blocksByDay.get(d) ?? []).map((b) => ({
                t: b.start_at,
                el: (
                  <div key={b.id} className="border border-dashed border-line bg-stone p-2 text-xs text-mist">
                    {jstTime(b.start_at)}〜{jstTime(b.end_at)} ブロック（{b.location_id ? locs.get(b.location_id) : "全拠点"}）{b.reason ?? ""}
                  </div>
                ),
              })),
            ].sort((a, b) => a.t.localeCompare(b.t));
            return (
              <Card key={d} title={`${Number(d.slice(5, 7))}/${Number(d.slice(8))}(${WEEK[jstWeekday(d)]})`}>
                <div className="space-y-2">{items.length ? items.map((x) => x.el) : <p className="text-xs text-mist">予定なし</p>}</div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Item({ r }: { r: AdminRow }) {
  return (
    <Link href={`/admin/reservations/${r.id}`} className="block border border-line p-2 text-xs hover:border-ink">
      <p className="tabular-nums">
        {jstTime(r.start_at)}〜{jstTime(r.end_at)} <StatusBadge status={r.status} />
      </p>
      <p className="mt-1">{r.location_short}・{r.customer_name}</p>
      <p className="text-mist">{r.service_snapshot.name}</p>
    </Link>
  );
}

function monthShift(date: string, delta: number) {
  const [y, m] = date.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 10);
}
