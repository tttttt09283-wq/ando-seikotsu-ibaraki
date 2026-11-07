import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMe } from "@/server/session";
import { approvalQueue } from "@/server/requests";
import { withdrawLeave, cancelLeave, resubmitLeave } from "../actions";
import { KIND_LABEL, EVENT_LABEL, type RequestStatus } from "@/lib/leave/requests";
import { formatDate, formatJstDateTime, jstToday } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input, Field } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { Flash } from "@/components/flash";
import { RequestStatusBadge } from "@/components/request-status";
import { DecisionForm } from "@/components/decision-form";

export const metadata: Metadata = { title: "申請の詳細" };

type Ev = { id: number; action: string; reason: string | null; reason_category: string | null; self_approved: boolean; occurred_at: string; actor_name: string | null };

export default async function LeaveDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requireMe();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data: r } = await supabase.from("leave_requests")
    .select("*, users!leave_requests_user_id_fkey(name), submitter:users!leave_requests_submitted_by_fkey(name), stores(name)")
    .eq("id", id).maybeSingle();
  if (!r) notFound();
  const [{ data: events }, queue] = await Promise.all([
    supabase.rpc("request_history", { p_kind: "leave", p_request: id }),
    approvalQueue(),
  ]);
  const myStep = queue.find((q) => q.request_id === id);
  const status = r.status as RequestStatus;
  const isRequester = me.id === r.user_id || me.id === r.submitted_by;
  const kind = r.kind as "PAID" | "SHIFT";
  return (
    <>
      <div>
        <Link href="/leave" className="text-sm text-brand-700">‹ 休暇の申請</Link>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-black text-brand-800">{KIND_LABEL[kind]}の申請 <RequestStatusBadge status={status} /></h1>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <Card>
        <CardContent className="grid gap-2 text-sm">
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5">
            <dt className="text-stone-500">休む人</dt><dd className="font-bold">{r.users?.name}（{r.stores?.name}）</dd>
            <dt className="text-stone-500">休む日</dt><dd><ul>{(r.dates as string[]).map((d) => <li key={d}>{formatDate(d)}</li>)}</ul></dd>
            <dt className="text-stone-500">日数</dt><dd>{r.total_days}日</dd>
            <dt className="text-stone-500">承認者</dt><dd>{kind === "PAID" ? "社長" : `${r.stores?.name}の院長`}</dd>
            {r.submitted_by !== r.user_id ? <><dt className="text-stone-500">代理申請</dt><dd>{r.submitter?.name}</dd></> : null}
            {r.reason ? <><dt className="text-stone-500">メモ</dt><dd>{r.reason}</dd></> : null}
          </dl>
          {r.balance_shortage ? <Alert tone="warn">残数不足のため例外確認として申請されています：{r.exception_note}</Alert> : null}
        </CardContent>
      </Card>

      {myStep ? (
        <Card className="border-brand-600">
          <CardHeader><CardTitle>承認の判断</CardTitle><span className="text-sm">利用できる残数 {myStep.available}日{myStep.pending_other ? `（ほかに承認待ち ${myStep.pending_other}日）` : ""}</span></CardHeader>
          <CardContent>
            <DecisionForm stepId={myStep.step_id} version={myStep.step_version} kind={kind} idempotencyKey={randomUUID()} backTo={`/leave/${id}`}
              selfApproval={myStep.self_approval} disabledApprove={myStep.available < myStep.total_days ? "残数が足りないため承認できません" : undefined} />
          </CardContent>
        </Card>
      ) : null}

      {isRequester && (status === "pending" || status === "returned") ? (
        <Card>
          <CardHeader><CardTitle>{status === "returned" ? "差戻しされました：直して再申請" : "取下げ"}</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            {status === "returned" ? (
              <form action={resubmitLeave} className="grid gap-2">
                <input type="hidden" name="id" value={id} />
                {(r.dates as string[]).map((d, i) => <Input key={i} type="date" name="dates" defaultValue={d} min={jstToday()} aria-label={`休む日 ${i + 1}`} />)}
                <Input type="date" name="dates" min={jstToday()} aria-label="休む日を追加" />
                <Field label="メモ"><Input name="reason" defaultValue={r.reason ?? ""} maxLength={500} /></Field>
                <Field label="例外確認の理由（残数が足りない場合のみ）"><Input name="exception_note" maxLength={500} /></Field>
                <div><SubmitButton>再申請する</SubmitButton></div>
              </form>
            ) : null}
            <form action={withdrawLeave}><input type="hidden" name="id" value={id} /><SubmitButton variant="outline">申請を取り下げる</SubmitButton></form>
          </CardContent>
        </Card>
      ) : null}

      {status === "approved" ? (
        <Card>
          <CardHeader><CardTitle>取消</CardTitle></CardHeader>
          <CardContent>
            <form action={cancelLeave} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <input type="hidden" name="id" value={id} />
              <Field label="取消の理由（必須）" hint="取得前なら本人・承認者が取り消せます。取得済みの日を含む場合は社長が実績を訂正します"><Input name="reason" required minLength={2} maxLength={300} /></Field>
              <SubmitButton variant="outline">取り消す（残数を戻す）</SubmitButton>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>承認の進み具合・履歴</CardTitle></CardHeader>
        <CardContent>
          <ol className="grid gap-2 text-sm">
            {((events ?? []) as unknown as Ev[]).map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-2 border-l-2 border-brand-100 pl-3">
                <b>{EVENT_LABEL[e.action] ?? e.action}</b>
                <span>{e.actor_name ?? "（不明）"}</span>
                {e.self_approved ? <Badge tone="warn">本人承認</Badge> : null}
                <span className="text-xs text-stone-500">{formatJstDateTime(e.occurred_at)}</span>
                {e.reason ? <span className="w-full text-stone-700">{e.reason_category ? `【${e.reason_category}】` : ""}{e.reason}</span> : null}
              </li>
            ))}
          </ol>
          {status === "pending" && !myStep ? <p className="mt-3 text-sm text-stone-600">{kind === "PAID" ? "社長" : "院長"}の承認待ちです。</p> : null}
        </CardContent>
      </Card>
    </>
  );
}
