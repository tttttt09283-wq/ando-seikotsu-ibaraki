import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { canAnywhere } from "@/server/session";
import { approvalQueue } from "@/server/requests";
import { partTimeQueue } from "@/server/part-time";
import { holidayChangeQueue } from "@/server/holiday-change";
import { CATEGORY_LABEL, hhmm, fmtMinutes } from "@/lib/part-time";
import { formatDate } from "@/lib/time";
import { KIND_LABEL, formatDates } from "@/lib/leave/requests";
import { fmtDays } from "@/lib/leave/types";
import { formatJstDateTime } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Flash } from "@/components/flash";
import { DecisionForm } from "@/components/decision-form";

export const metadata: Metadata = { title: "承認" };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [paid, shift, pt, hcGm, hcFinal] = await Promise.all([canAnywhere("leave.paid.final_approve"), canAnywhere("leave.shift.approve"), canAnywhere("parttime.final_approve"),
    canAnywhere("holidaychange.gm_review"), canAnywhere("holidaychange.final_approve")]);
  if (!paid && !shift && !pt && !hcGm && !hcFinal) notFound();
  const sp = await searchParams;
  const [queue, ptQueue, hcQueue] = await Promise.all([paid || shift ? approvalQueue() : Promise.resolve([]), pt ? partTimeQueue() : Promise.resolve([]), hcGm || hcFinal ? holidayChangeQueue() : Promise.resolve([])]);
  const total = queue.length + ptQueue.length + hcQueue.length;
  return (
    <>
      <h1 className="text-xl font-black text-brand-800">承認待ち（{total}件）</h1>
      <Flash ok={sp.ok} err={sp.err} />
      {total === 0 ? <Alert tone="ok">承認待ちはありません。</Alert> : null}
      {hcQueue.map((q) => (
        <Card key={q.step_id}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Badge>振休→アルバイト勤務</Badge>{q.target_name}さん<span className="text-sm font-normal text-stone-600">{q.store_name}</span>
              <Badge tone="warn">{q.step_kind === "gm_review" ? "GMの確認" : "社長の最終承認（GM確認済み）"}</Badge>
            </CardTitle>
            <Link href={`/holiday-change/${q.request_id}`} className="text-sm font-bold text-brand-700">詳細 ›</Link>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <dl className="grid grid-cols-[7rem_1fr] gap-y-1">
              <dt className="text-stone-500">勤務日時</dt><dd className="font-bold">{formatDate(q.shift_holiday_date)} {hhmm(q.start_time)}〜{hhmm(q.end_time)}（実働{fmtMinutes(q.minutes)}）</dd>
              <dt className="text-stone-500">申請理由</dt><dd>{q.reason}</dd>
              <dt className="text-stone-500">申請者</dt><dd>{q.requested_by_name}（{formatJstDateTime(q.submitted_at)}）</dd>
              {q.gm_comment ? <><dt className="text-stone-500">GMのコメント</dt><dd>{q.gm_comment}</dd></> : null}
            </dl>
            <p className="text-xs text-stone-500">承認で確定すると、この日の振休は使ったことになります（残数には戻りません）。</p>
            <DecisionForm target="holiday_change" stepId={q.step_id} version={q.step_version} kind="HOLIDAY_CHANGE" idempotencyKey={randomUUID()} backTo="/approvals"
              approveLabel={q.step_kind === "gm_review" ? "確認して社長へ" : "承認（変更確定）"} />
          </CardContent>
        </Card>
      ))}
      {ptQueue.map((q) => (
        <Card key={q.step_id} className={q.category === "help" ? "border-red-400" : ""}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {q.category === "help" ? <Badge tone="danger">緊急</Badge> : null}<Badge>アルバイト勤務</Badge>{q.store_name}
              {q.is_exception ? <Badge tone="warn">シフト確定後</Badge> : null}
            </CardTitle>
            <Link href={`/part-time/${q.request_id}`} className="text-sm font-bold text-brand-700">詳細 ›</Link>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <dl className="grid grid-cols-[7rem_1fr] gap-y-1">
              <dt className="text-stone-500">勤務日時</dt><dd className="font-bold">{formatDate(q.work_date)} {hhmm(q.start_time)}〜{hhmm(q.end_time)}（実働{fmtMinutes(q.minutes)}）</dd>
              <dt className="text-stone-500">区分</dt><dd>{CATEGORY_LABEL[q.category]}</dd>
              <dt className="text-stone-500">勤務する人</dt><dd>{q.worker_name ?? "未定（院長があとで設定）"}</dd>
              <dt className="text-stone-500">申請理由</dt><dd>{q.reason}</dd>
              <dt className="text-stone-500">申請者</dt><dd>{q.requested_by_name}（{formatJstDateTime(q.submitted_at)}）</dd>
            </dl>
            {q.is_exception ? <Alert tone="warn">シフト確定（{formatDate(q.cutoff_date)}）後の例外申請：{q.exception_reason}</Alert> : null}
            <DecisionForm target="part_time" stepId={q.step_id} version={q.step_version} kind="PART_TIME" idempotencyKey={randomUUID()} backTo="/approvals" />
          </CardContent>
        </Card>
      ))}
      {queue.map((q) => {
        const after = q.available - q.pending_other - q.total_days;
        return (
          <Card key={q.step_id} className={q.balance_shortage || after < 0 ? "border-red-300" : ""}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <Badge tone={q.kind === "PAID" ? "brand" : "neutral"}>{KIND_LABEL[q.kind]}</Badge>{q.user_name}さん<span className="text-sm font-normal text-stone-600">{q.store_name}</span>
                {q.self_approval ? <Badge tone="warn">ご自身の振休</Badge> : null}
              </CardTitle>
              <Link href={`/leave/${q.request_id}`} className="text-sm font-bold text-brand-700">詳細 ›</Link>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <dl className="grid grid-cols-[7rem_1fr] gap-y-1">
                <dt className="text-stone-500">休む日</dt><dd className="font-bold">{formatDates(q.dates)}（{q.total_days}日）</dd>
                <dt className="text-stone-500">残数</dt><dd>利用できる {fmtDays(q.available)}{q.pending_other ? `・ほかに承認待ち ${fmtDays(q.pending_other)}` : ""} → 承認後 <b className={after < 0 ? "text-red-700" : ""}>{fmtDays(after)}</b></dd>
                <dt className="text-stone-500">申請者</dt><dd>{q.submitted_by_name}（{formatJstDateTime(q.submitted_at)}）</dd>
                {q.reason ? <><dt className="text-stone-500">メモ</dt><dd>{q.reason}</dd></> : null}
              </dl>
              {q.balance_shortage ? <Alert tone="warn">残数不足の例外確認：{q.exception_note}</Alert> : null}
              {q.kind === "PAID" ? <p className="text-xs text-stone-500">有給は労働者の権利です。事業の正常な運営を妨げる場合を除き、承認してください。日程の調整をお願いする場合は「差戻し」、却下は理由の区分を選びます。</p> : null}
              <DecisionForm stepId={q.step_id} version={q.step_version} kind={q.kind} idempotencyKey={randomUUID()} backTo="/approvals"
                selfApproval={q.self_approval} disabledApprove={q.available - q.total_days < 0 ? "残数が足りないため承認できません（日程の調整か残数の修正が必要）" : undefined} />
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
