import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/server/session";
import { getStoreLeave } from "@/server/leave";
import { ROLE_LABEL, type RoleCode } from "@/lib/roles";
import { fmtDays, FIVE_DAY_LABEL } from "@/lib/leave/types";
import { formatDate } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { PhaseNote } from "@/components/phase-note";

export const metadata: Metadata = { title: "院長ダッシュボード" };

export default async function StorePage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(storeId) || !(await can("staff.view.store", storeId))) notFound();
  const supabase = await createClient();
  const { data: store } = await supabase.from("stores").select("name").eq("id", storeId).single();
  if (!store) notFound();
  const rows = await getStoreLeave(storeId);
  const overdue = rows.filter((r) => r.shift.overdue + r.shift_holiday.overdue > 0);
  const fiveDayAlerts = rows.filter((r) => r.five_day.target && ["caution", "warning", "urgent"].includes(r.five_day.level));
  return (
    <>
      <h1 className="text-xl font-black text-brand-800">{store.name}</h1>
      {overdue.length ? (
        <Alert tone="danger"><b>期限切れの振休：</b>{overdue.map((r) => `${r.name}さん ${fmtDays(r.shift.overdue + r.shift_holiday.overdue)}`).join("、")}（出勤した月の末日を過ぎています）</Alert>
      ) : null}
      {fiveDayAlerts.length ? (
        <Alert tone="warn"><b>有給の年5日：</b>{fiveDayAlerts.map((r) => `${r.name}さん（${r.five_day.target ? `あと${fmtDays(r.five_day.remaining_required)}・期限${formatDate(r.five_day.period_end)}` : ""}）`).join("、")}</Alert>
      ) : null}
      <Card>
        <CardHeader><CardTitle>スタッフ別の残数（{rows.length}名）</CardTitle><span className="text-xs text-stone-500">名前を押すと明細</span></CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-stone-100">
            {rows.map((r) => {
              const shiftTotal = r.shift.current + r.shift_holiday.current;
              const shiftOver = r.shift.overdue + r.shift_holiday.overdue;
              const f = r.five_day.target ? FIVE_DAY_LABEL[r.five_day.level] : null;
              return (
                <li key={r.user_id}>
                  <Link href={`/staff/${r.user_id}/leave`} className="grid gap-1.5 px-4 py-3 hover:bg-stone-50 sm:grid-cols-[1fr_auto] sm:items-center">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <b>{r.name}</b>
                      <Badge tone={r.role_code === "MANAGER" ? "brand" : "neutral"}>{ROLE_LABEL[r.role_code as RoleCode] ?? r.role_code}</Badge>
                      {f ? <Badge tone={f.tone}>年5日：{f.text}</Badge> : null}
                    </span>
                    <span className="flex flex-wrap gap-3 text-sm tabular-nums">
                      <span>有給 <b className="text-base">{fmtDays(r.paid.current)}</b>{r.paid.planned ? <span className="text-xs text-stone-500">（予定{fmtDays(r.paid.planned)}）</span> : null}</span>
                      <span className={shiftOver ? "text-red-700" : ""}>振休 <b className="text-base">{fmtDays(shiftTotal)}</b>{shiftOver ? "（期限切れあり）" : r.shift.next_expiry_date || r.shift_holiday.next_expiry_date ? <span className="text-xs text-stone-500">（月末まで）</span> : null}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
            {rows.length === 0 ? <li className="px-4 py-6 text-center text-sm text-stone-500">在籍スタッフがいません</li> : null}
          </ul>
        </CardContent>
      </Card>
      <PhaseNote phase="PHASE 4〜9">振休の承認待ち・有給の申請状況・会議予定・議事録の提出期限をここに表示します。</PhaseNote>
    </>
  );
}
