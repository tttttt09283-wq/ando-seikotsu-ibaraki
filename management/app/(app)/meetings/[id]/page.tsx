import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMeeting, storeMembers } from "@/server/meetings";
import { updateMeeting, deleteMeeting } from "../actions";
import { MEETING_STATUS, meetingStatusLabel, remainingLabel, TASK_STATUS } from "@/lib/meetings";
import { formatDate, formatJstDateTime, jstToday } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input, Field } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { Flash } from "@/components/flash";
import { MinutesForm } from "./minutes-form";

export const metadata: Metadata = { title: "会議・議事録" };

export default async function MeetingDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; edit?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^\d{1,12}$/.test(id)) notFound();
  const m = await getMeeting(Number(id));
  if (!m) notFound();
  const today = jstToday();
  const submitted = !!m.submitted_at;
  const members = m.can_edit && m.store_id ? await storeMembers(m.store_id) : [];
  // 参加者・担当者の候補に、院の所属者以外ですでに入っている人も加える
  const extra = [...m.attendees.filter((a) => a.user_id).map((a) => ({ user_id: a.user_id!, name: a.name })),
    ...m.decisions.filter((d) => d.owner_user_id).map((d) => ({ user_id: d.owner_user_id!, name: d.owner_name ?? "" }))];
  const allMembers = [...new Map([...members, ...extra].map((x) => [x.user_id, { user_id: x.user_id, name: x.name }])).values()];
  const decisions = m.decisions.filter((d) => d.is_decision);
  const posItems = m.decisions.filter((d) => !d.is_decision);
  const showForm = m.can_edit && m.store_id && (!submitted || sp.edit === "1");
  const st = MEETING_STATUS[m.status];
  return (
    <>
      <div>
        <Link href="/meetings" className="text-sm text-brand-700">‹ 院内会議</Link>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-black text-brand-800">{m.title} <Badge tone={m.submitted_late ? "warn" : st.tone}>{meetingStatusLabel(m.status, m.submitted_late)}</Badge></h1>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <Card>
        <CardContent className="grid gap-2 text-sm">
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5">
            <dt className="text-stone-500">院</dt><dd className="font-bold">{m.store_name ?? "未設定"}</dd>
            <dt className="text-stone-500">開催日</dt><dd className="font-bold">{formatDate(m.held_on)}</dd>
            <dt className="text-stone-500">提出期限</dt><dd>{formatJstDateTime(m.minutes_due_at)}{m.status === "awaiting_minutes" || m.status === "overdue" ? <b className={`ml-2 ${m.status === "overdue" ? "text-red-700" : "text-amber-700"}`}>{remainingLabel(m.minutes_due_at)}</b> : null}</dd>
            {submitted ? <><dt className="text-stone-500">提出</dt><dd>{formatJstDateTime(m.submitted_at!)}（{m.minutes?.submitted_by_name}）{m.minutes && m.minutes.revision > 1 ? `・修正${m.minutes.revision - 1}回` : ""}</dd></> : null}
          </dl>
          {m.status === "exempt" ? <Alert tone="info">新システムの導入前の会議のため、提出期限の管理の対象外です。</Alert> : null}
          {m.status === "overdue" ? <Alert tone="danger">提出期限を過ぎています。早めに提出してください（提出すると「提出済み（期限超過）」になります）。</Alert> : null}
          {!m.store_id ? <Alert tone="warn">この会議は院が未設定です（POSの共用アカウントで登録された会議など）。下で院を設定すると、院長が議事録を書けるようになります。</Alert> : null}
          {m.notes ? <div className="rounded-lg bg-stone-50 p-3"><p className="mb-1 text-xs font-bold text-stone-500">POSのメモ</p><p className="whitespace-pre-wrap">{m.notes}</p></div> : null}
        </CardContent>
      </Card>

      {m.can_edit && !submitted ? (
        <details className="rounded-xl border border-stone-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-bold text-brand-700">開催日・会議名を変更／会議を削除</summary>
          <form action={updateMeeting} className="mt-3 grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
            <input type="hidden" name="id" value={m.id} />
            <Field label="開催日"><Input type="date" name="held_on" defaultValue={m.held_on} required /></Field>
            <Field label="会議名"><Input name="title" defaultValue={m.title} required minLength={2} maxLength={100} /></Field>
            <SubmitButton variant="outline">変更する</SubmitButton>
          </form>
          <form action={deleteMeeting} className="mt-3"><input type="hidden" name="id" value={m.id} /><SubmitButton variant="ghost" className="text-red-700">この会議を削除する</SubmitButton></form>
        </details>
      ) : null}

      {submitted && !showForm ? (
        <Card>
          <CardHeader><CardTitle>議事録</CardTitle>{m.can_edit ? <Link href={`/meetings/${m.id}?edit=1`} className="text-sm font-bold text-brand-700">修正する</Link> : null}</CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div><p className="text-xs font-bold text-stone-500">参加者</p><p>{m.attendees.map((a) => a.name).join("、")}</p></div>
            <div><p className="text-xs font-bold text-stone-500">議題</p><p className="whitespace-pre-wrap">{m.minutes?.agenda}</p></div>
            <div><p className="text-xs font-bold text-stone-500">会議の内容</p><p className="whitespace-pre-wrap">{m.minutes?.content}</p></div>
          </CardContent>
        </Card>
      ) : null}

      {showForm ? (
        <Card className="border-brand-600">
          <CardHeader><CardTitle>{submitted ? "議事録の修正（再提出すると修正の履歴に残ります）" : "議事録"}</CardTitle></CardHeader>
          <CardContent>
            <MinutesForm meetingId={m.id} members={allMembers} submitted={submitted} canSubmit={m.held_on <= today} heldOn={m.held_on}
              initial={{
                agenda: m.minutes?.agenda ?? "", content: m.minutes?.content ?? "",
                attendees: m.attendees.filter((a) => a.user_id).map((a) => a.user_id!), guests: m.attendees.filter((a) => a.guest).map((a) => a.name).join("\n"),
                decisions: decisions.map((d) => ({ id: d.id, title: d.title, detail: d.detail ?? "", owner_user_id: d.owner_user_id ?? "", due_date: d.due_date ?? "" })),
                noDecisions: m.no_decisions,
              }} />
          </CardContent>
        </Card>
      ) : null}

      {submitted && !showForm ? (
        <Card>
          <CardHeader><CardTitle>決定事項と実行状況</CardTitle><Link href="/tasks" className="text-sm font-bold text-brand-700">タスク ›</Link></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-stone-100 text-sm">
              {decisions.map((d) => (
                <li key={d.id} className="grid gap-1 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2"><b>{d.title}</b><Badge tone={d.status === "done" ? "ok" : d.status === "doing" ? "brand" : "neutral"}>{TASK_STATUS[d.status]}{d.status === "doing" ? ` ${d.progress}%` : ""}</Badge></div>
                  <p className="text-stone-700">{d.detail}</p>
                  <p className="text-xs text-stone-500">担当：{d.owner_name ?? "-"}　期限：{formatDate(d.due_date)}</p>
                </li>
              ))}
              {decisions.length === 0 ? <li className="px-4 py-4 text-stone-500">{m.no_decisions ? "決定事項なし（議事録で明示）" : "ありません"}</li> : null}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {posItems.length ? (
        <Card>
          <CardHeader><CardTitle>POSで登録した行動計画</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-stone-100 text-sm">
              {posItems.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5"><span>{d.title}</span><span className="text-xs text-stone-500">{d.owner_name ?? "担当未設定"}・{formatDate(d.due_date)}</span><Badge tone={d.status === "done" ? "ok" : "neutral"}>{TASK_STATUS[d.status]}</Badge></li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {m.revisions.length ? (
        <Card>
          <CardHeader><CardTitle>提出の履歴</CardTitle></CardHeader>
          <CardContent>
            <ol className="grid gap-1 text-sm">
              {m.revisions.map((r) => (
                <li key={r.revision} className="flex flex-wrap gap-2 border-l-2 border-brand-100 pl-3"><b>{r.revision === 1 ? "提出" : `修正（${r.revision - 1}回目）`}</b><span>{r.submitted_by_name}</span><span className="text-xs text-stone-500">{formatJstDateTime(r.submitted_at)}</span>{r.late ? <Badge tone="warn">期限後</Badge> : null}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
