import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/server/session";
import { partTimeQueue, partTimeWorkers } from "@/server/part-time";
import { assignWorker, withdrawPartTime, cancelPartTime, resubmitPartTime } from "../actions";
import { CATEGORY_LABEL, hhmm, workMinutes, fmtMinutes, type PartTimeCategory } from "@/lib/part-time";
import { EVENT_LABEL, type RequestStatus } from "@/lib/leave/requests";
import { formatDate, formatJstDateTime, jstToday } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input, Select, Field } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { Flash } from "@/components/flash";
import { RequestStatusBadge } from "@/components/request-status";
import { DecisionForm } from "@/components/decision-form";

export const metadata: Metadata = { title: "アルバイト勤務の申請" };
type Ev = { id: number; action: string; reason: string | null; occurred_at: string; actor_name: string | null };

export default async function PartTimeDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data: r } = await supabase.from("part_time_requests")
    .select("*, stores(name), worker:users!part_time_requests_worker_user_id_fkey(name), requester:users!part_time_requests_requested_by_fkey(name)")
    .eq("id", id).maybeSingle();
  if (!r) notFound();
  const [{ data: events }, queue, isRequester] = await Promise.all([
    supabase.rpc("request_history", { p_kind: "part_time", p_request: id }),
    partTimeQueue(),
    can("parttime.request", r.store_id),
  ]);
  const workers = isRequester ? await partTimeWorkers([r.store_id]) : [];
  const myStep = queue.find((q) => q.request_id === id);
  const status = r.status as RequestStatus;
  const category = r.category as PartTimeCategory;
  const today = jstToday();
  return (
    <>
      <div>
        <Link href="/part-time" className="text-sm text-brand-700">‹ アルバイト勤務</Link>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-black text-brand-800">アルバイト勤務の申請 <RequestStatusBadge status={status} /></h1>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <Card>
        <CardContent className="grid gap-2 text-sm">
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5">
            <dt className="text-stone-500">院</dt><dd className="font-bold">{r.stores?.name}</dd>
            <dt className="text-stone-500">区分</dt><dd><Badge tone={category === "help" ? "danger" : "neutral"}>{CATEGORY_LABEL[category]}</Badge></dd>
            <dt className="text-stone-500">勤務日時</dt><dd className="font-bold">{formatDate(r.work_date)} {hhmm(r.start_time)}〜{hhmm(r.end_time)}（休憩{r.break_minutes}分・実働{fmtMinutes(workMinutes(hhmm(r.start_time), hhmm(r.end_time), r.break_minutes))}）</dd>
            <dt className="text-stone-500">勤務する人</dt><dd>{r.worker?.name ?? <Badge tone="warn">未定（あとで入力）</Badge>}</dd>
            <dt className="text-stone-500">申請理由</dt><dd>{r.reason}</dd>
            <dt className="text-stone-500">申請者</dt><dd>{r.requester?.name}</dd>
            <dt className="text-stone-500">シフト確定</dt><dd>{formatDate(r.cutoff_date)}まで</dd>
          </dl>
          {r.is_exception ? <Alert tone="warn">シフト確定後の例外申請：{r.exception_reason}</Alert> : null}
        </CardContent>
      </Card>

      {myStep ? (
        <Card className="border-brand-600">
          <CardHeader><CardTitle>承認の判断（社長）</CardTitle></CardHeader>
          <CardContent><DecisionForm target="part_time" stepId={myStep.step_id} version={myStep.step_version} kind="PART_TIME" idempotencyKey={randomUUID()} backTo={`/part-time/${id}`} /></CardContent>
        </Card>
      ) : null}

      {isRequester && ["pending", "returned", "approved"].includes(status) && r.work_date >= today ? (
        <Card>
          <CardHeader><CardTitle>勤務する人を設定・変更</CardTitle></CardHeader>
          <CardContent>
            <form action={assignWorker} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={id} />
              <div className="grow"><Field label="アルバイトの人"><Select name="worker_user_id" defaultValue={r.worker_user_id ?? ""}><option value="">未定</option>{workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field></div>
              <SubmitButton variant="outline">設定する</SubmitButton>
            </form>
            {workers.length === 0 ? <p className="mt-2 text-xs text-stone-500">この院にアルバイト雇用の人がまだ登録されていません（スタッフ管理で登録すると選べます）。</p> : null}
            {status === "approved" ? <p className="mt-2 text-xs text-stone-500">承認済みの申請の勤務者を変えると、社長に通知されます。</p> : null}
          </CardContent>
        </Card>
      ) : null}

      {isRequester && status === "returned" ? (
        <Card>
          <CardHeader><CardTitle>差戻しされました：直して再申請</CardTitle></CardHeader>
          <CardContent>
            <form action={resubmitPartTime} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="id" value={id} /><input type="hidden" name="worker_user_id" value={r.worker_user_id ?? ""} />
              <Field label="区分"><Select name="category" defaultValue={category}>{(["plan", "help", "busy"] as const).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</Select></Field>
              <Field label="勤務日"><Input type="date" name="work_date" defaultValue={r.work_date} min={today} required /></Field>
              <Field label="開始"><Input type="time" name="start_time" defaultValue={hhmm(r.start_time)} required /></Field>
              <Field label="終了"><Input type="time" name="end_time" defaultValue={hhmm(r.end_time)} required /></Field>
              <Field label="休憩（分）"><Input type="number" name="break_minutes" defaultValue={r.break_minutes} min={0} max={240} /></Field>
              <Field label="申請理由"><Input name="reason" defaultValue={r.reason} required minLength={2} /></Field>
              <Field label="例外申請の理由（シフト確定後の場合）"><Input name="exception_reason" defaultValue={r.exception_reason ?? ""} /></Field>
              <div className="sm:col-span-2"><SubmitButton>再申請する</SubmitButton></div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {isRequester && (status === "pending" || status === "returned") ? (
        <form action={withdrawPartTime}><input type="hidden" name="id" value={id} /><SubmitButton variant="outline">申請を取り下げる</SubmitButton></form>
      ) : null}
      {status === "approved" ? (
        <Card>
          <CardHeader><CardTitle>取消</CardTitle></CardHeader>
          <CardContent>
            <form action={cancelPartTime} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <input type="hidden" name="id" value={id} />
              <Field label="取消の理由（必須）" hint="勤務日を過ぎた申請の取消は社長が行います"><Input name="reason" required minLength={2} maxLength={300} /></Field>
              <SubmitButton variant="outline">取り消す</SubmitButton>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>履歴</CardTitle></CardHeader>
        <CardContent>
          <ol className="grid gap-2 text-sm">
            {((events ?? []) as unknown as Ev[]).map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-2 border-l-2 border-brand-100 pl-3">
                <b>{e.action === "assign_worker" ? "勤務者の設定" : EVENT_LABEL[e.action] ?? e.action}</b><span>{e.actor_name ?? "（不明）"}</span>
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
