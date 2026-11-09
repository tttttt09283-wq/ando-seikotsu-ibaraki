import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/server/session";
import { holidayChangeQueue, HC_STATUS, type HcStatus } from "@/server/holiday-change";
import { withdrawHolidayChange, resubmitHolidayChange } from "../actions";
import { hhmm, workMinutes, fmtMinutes } from "@/lib/part-time";
import { EVENT_LABEL } from "@/lib/leave/requests";
import { formatDate, formatJstDateTime } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input, Field } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { Flash } from "@/components/flash";
import { DecisionForm } from "@/components/decision-form";

export const metadata: Metadata = { title: "振休→アルバイト勤務の申請" };
type Ev = { id: number; action: string; reason: string | null; occurred_at: string; actor_name: string | null };
type Step = { id: string; step_no: number; step_kind: "gm_review" | "president_final"; status: string; decided_at: string | null; comment: string | null };
const STEP_LABEL = { gm_review: "GMの確認", president_final: "社長の承認" } as const;
const STEP_STATUS: Record<string, { text: string; tone: "warn" | "ok" | "danger" | "neutral" | "brand" }> = {
  waiting: { text: "前の段階を待っています", tone: "neutral" }, pending: { text: "対応待ち", tone: "warn" }, approved: { text: "済み", tone: "ok" },
  returned: { text: "差戻し", tone: "brand" }, rejected: { text: "却下", tone: "danger" }, cancelled: { text: "取りやめ", tone: "neutral" },
};

export default async function HolidayChangeDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data: r } = await supabase.from("holiday_change_requests")
    .select("*, stores(name), target:users!holiday_change_requests_target_user_id_fkey(name), requester:users!holiday_change_requests_requested_by_fkey(name)")
    .eq("id", id).maybeSingle();
  if (!r) notFound();
  const [{ data: events }, { data: stepRows }, queue, isRequester] = await Promise.all([
    supabase.rpc("request_history", { p_kind: "holiday_change", p_request: id }),
    supabase.from("approval_steps").select("id, step_no, step_kind, status, decided_at, comment").eq("holiday_change_request_id", id).order("step_no"),
    holidayChangeQueue(),
    can("holidaychange.request", r.store_id),
  ]);
  // 再申請すると段階が作り直されるので、最新の組（GM確認・社長承認）だけを表示する
  const steps = ((stepRows ?? []) as Step[]).slice(-2);
  const myStep = queue.find((q) => q.request_id === id);
  const status = r.status as HcStatus;
  return (
    <>
      <div>
        <Link href="/holiday-change" className="text-sm text-brand-700">‹ 振休→アルバイト勤務</Link>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-black text-brand-800">振休→アルバイト勤務の申請 <Badge tone={HC_STATUS[status].tone}>{HC_STATUS[status].text}</Badge></h1>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <Card>
        <CardContent className="grid gap-2 text-sm">
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5">
            <dt className="text-stone-500">院</dt><dd className="font-bold">{r.stores?.name}</dd>
            <dt className="text-stone-500">勤務する人</dt><dd className="font-bold">{r.target?.name}さん</dd>
            <dt className="text-stone-500">変更する振休</dt><dd className="font-bold">{formatDate(r.shift_holiday_date)}</dd>
            <dt className="text-stone-500">勤務時間</dt><dd>{hhmm(r.start_time)}〜{hhmm(r.end_time)}（休憩{r.break_minutes}分・実働{fmtMinutes(workMinutes(hhmm(r.start_time), hhmm(r.end_time), r.break_minutes))}）</dd>
            <dt className="text-stone-500">申請理由</dt><dd>{r.reason}</dd>
            <dt className="text-stone-500">申請者</dt><dd>{r.requester?.name}</dd>
          </dl>
          {status === "approved" ? <Alert tone="ok">変更が確定しました。この振休は使ったことになり、当日はアルバイトとしての勤務です。</Alert>
            : ["pending_gm", "pending_president", "returned"].includes(status) ? <p className="text-xs text-stone-500">承認されると、この振休は使ったことになります（残数には戻りません）。確定するまでは振休の取得予定のままです。</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>承認の流れ</CardTitle></CardHeader>
        <CardContent>
          <ol className="grid gap-2 text-sm">
            {steps.map((s, i) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">{i + 1}</span>
                <b>{STEP_LABEL[s.step_kind]}</b>
                <Badge tone={STEP_STATUS[s.status]?.tone ?? "neutral"}>{STEP_STATUS[s.status]?.text ?? s.status}</Badge>
                {s.decided_at ? <span className="text-xs text-stone-500">{formatJstDateTime(s.decided_at)}</span> : null}
                {s.comment ? <span className="w-full pl-8 text-stone-700">{s.comment}</span> : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {myStep ? (
        <Card className="border-brand-600">
          <CardHeader><CardTitle>{myStep.step_kind === "gm_review" ? "事前確認（GM）" : "最終承認（社長）"}</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            {myStep.gm_comment ? <p className="text-sm">GMのコメント：{myStep.gm_comment}</p> : null}
            <DecisionForm target="holiday_change" stepId={myStep.step_id} version={myStep.step_version} kind="HOLIDAY_CHANGE" idempotencyKey={randomUUID()}
              backTo={`/holiday-change/${id}`} approveLabel={myStep.step_kind === "gm_review" ? "確認して社長へ" : "承認（変更確定）"} />
          </CardContent>
        </Card>
      ) : null}

      {isRequester && status === "returned" ? (
        <Card>
          <CardHeader><CardTitle>差戻しされました：直して再申請</CardTitle></CardHeader>
          <CardContent>
            <form action={resubmitHolidayChange} className="grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="id" value={id} />
              <Field label="開始"><Input type="time" name="start_time" defaultValue={hhmm(r.start_time)} required /></Field>
              <Field label="終了"><Input type="time" name="end_time" defaultValue={hhmm(r.end_time)} required /></Field>
              <Field label="休憩（分）"><Input type="number" name="break_minutes" defaultValue={r.break_minutes} min={0} max={240} /></Field>
              <div className="sm:col-span-3"><Field label="申請理由"><Input name="reason" defaultValue={r.reason} required minLength={2} maxLength={500} /></Field></div>
              <div className="sm:col-span-3"><SubmitButton>再申請する（GMの確認から）</SubmitButton></div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {isRequester && ["pending_gm", "pending_president", "returned"].includes(status) ? (
        <form action={withdrawHolidayChange}><input type="hidden" name="id" value={id} /><SubmitButton variant="outline">申請を取り下げる</SubmitButton></form>
      ) : null}

      <Card>
        <CardHeader><CardTitle>履歴</CardTitle></CardHeader>
        <CardContent>
          <ol className="grid gap-2 text-sm">
            {((events ?? []) as unknown as Ev[]).map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-2 border-l-2 border-brand-100 pl-3">
                <b>{EVENT_LABEL[e.action] ?? e.action}</b><span>{e.actor_name ?? "（不明）"}</span>
                <span className="text-xs text-stone-500">{formatJstDateTime(e.occurred_at)}</span>
                {e.reason ? <span className="w-full text-stone-700">{e.reason}</span> : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </>
  );
}
