import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRule } from "@/server/rules";
import { withdrawVersion, deleteDraft, publishVersion } from "../../actions";
import { RULE_STATUS, appliesLabel, effectiveLabel } from "@/lib/rules";
import { EVENT_LABEL } from "@/lib/leave/requests";
import { formatDate, formatJstDateTime, jstToday } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/submit-button";
import { Flash } from "@/components/flash";
import { DecisionForm } from "@/components/decision-form";
import { RuleBody, RuleDiff } from "@/components/rule-body";
import { DraftForm } from "./draft-form";

export const metadata: Metadata = { title: "規定の改定案" };
type Ev = { id: number; action: string; reason: string | null; occurred_at: string; actor_name: string | null; self_approved: boolean };
const RULE_EVENT: Record<string, string> = { ...EVENT_LABEL, create: "作成", publish: "公開", withdraw: "取下げ", cancel: "破棄", submit: "承認依頼" };

export default async function RuleEditPage({ params, searchParams }: { params: Promise<{ no: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { no } = await params;
  const sp = await searchParams;
  if (!/^\d{3}$/.test(no)) notFound();
  const r = await getRule(no);
  if (!r || !(r.can_edit || r.can_approve)) notFound();
  const w = r.working;
  const supabase = await createClient();
  const { data: events } = w ? await supabase.rpc("request_history", { p_kind: "rule", p_request: w.id }) : { data: [] };
  const hidden = w ? <><input type="hidden" name="version_id" value={w.id} /><input type="hidden" name="rule_no" value={no} /></> : null;
  return (
    <>
      <div>
        <Link href={`/rules/${no}`} className="text-sm text-brand-700">‹ {r.rule_no} {r.title}</Link>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-black text-brand-800">改定案{w ? <>（第{w.version_no}版）<Badge tone={RULE_STATUS[w.status].tone}>{RULE_STATUS[w.status].text}</Badge></> : null}</h1>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      {!w ? <Alert tone="info">作業中の改定案はありません。<Link href={`/rules/${no}`} className="font-bold underline">規定のページ</Link>から改定案を作れます。</Alert> : null}
      {w?.returned_reason && w.status === "draft" ? <Alert tone="warn">社長から差戻されました：{w.returned_reason}</Alert> : null}

      {w && w.status === "draft" && r.can_edit ? (
        <Card>
          <CardHeader><CardTitle>下書きの編集</CardTitle><span className="text-xs text-stone-600">作成：{w.created_by_name ?? "初期登録"}</span></CardHeader>
          <CardContent><DraftForm ruleNo={no} v={w} /></CardContent>
        </Card>
      ) : null}

      {w && w.status !== "draft" ? (
        <Card>
          <CardHeader><CardTitle>{w.title}</CardTitle><span className="text-xs text-stone-600">{w.created_by_name ?? "初期登録"}・依頼 {w.submitted_at ? formatJstDateTime(w.submitted_at) : "-"}</span></CardHeader>
          <CardContent className="grid gap-3">
            <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
              <dt className="text-stone-500">施行日</dt><dd>{formatDate(w.effective_date)}（{effectiveLabel(w.effective_date, w.is_provisional, jstToday())}）</dd>
              <dt className="text-stone-500">適用対象</dt><dd>{appliesLabel(w.applies_to)}</dd>
              <dt className="text-stone-500">改定内容</dt><dd>{w.change_summary ?? "-"}</dd>
            </dl>
            <RuleBody body={w.body} />
          </CardContent>
        </Card>
      ) : null}

      {w && r.current ? (
        <Card>
          <CardHeader><CardTitle>公開中の版（第{r.current.version_no}版）との違い</CardTitle></CardHeader>
          <CardContent><RuleDiff before={r.current.body} after={w.body} /></CardContent>
        </Card>
      ) : null}

      {w && w.status === "pending_approval" && r.can_approve && w.step_id ? (
        <Card className="border-brand-600">
          <CardHeader><CardTitle>承認の判断（社長）</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            {w.mine || w.created_by_name === null ? <Alert tone="warn">ご自身が作成・依頼した改定案です。承認すると「本人承認」として記録し、GMに通知します。</Alert> : null}
            <DecisionForm target="rule" kind="RULE" stepId={w.step_id} version={w.step_version ?? 1} idempotencyKey={randomUUID()} backTo={`/rules/${no}/edit`} />
          </CardContent>
        </Card>
      ) : null}

      {w && w.status === "approved" && r.can_approve ? (
        <form action={publishVersion} className="rounded-xl border border-brand-600 bg-brand-50 p-4">
          {hidden}
          <p className="mb-2 text-sm">公開すると、対象の人（{appliesLabel(w.applies_to)}）に通知し、確認をお願いします。{r.current ? "今の版は旧版になります。" : ""}</p>
          <SubmitButton>公開する</SubmitButton>
        </form>
      ) : null}

      {w && r.can_edit ? (
        <div className="flex flex-wrap gap-2">
          {w.status === "pending_approval" || w.status === "approved" ? <form action={withdrawVersion}>{hidden}<SubmitButton variant="outline">取り下げて下書きに戻す</SubmitButton></form> : null}
          {w.status === "draft" ? <form action={deleteDraft}>{hidden}<SubmitButton variant="ghost" className="text-red-700">この改定案を削除</SubmitButton></form> : null}
        </div>
      ) : null}

      {w ? (
        <Card>
          <CardHeader><CardTitle>この改定案の履歴</CardTitle></CardHeader>
          <CardContent>
            <ol className="grid gap-2 text-sm">
              {((events ?? []) as unknown as Ev[]).map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-2 border-l-2 border-brand-100 pl-3">
                  <b>{RULE_EVENT[e.action] ?? e.action}</b><span>{e.actor_name ?? "（不明）"}</span>{e.self_approved ? <Badge tone="warn">本人承認</Badge> : null}
                  <span className="text-xs text-stone-500">{formatJstDateTime(e.occurred_at)}</span>
                  {e.reason ? <span className="w-full text-stone-700">{e.reason}</span> : null}
                </li>
              ))}
              {(events ?? []).length === 0 ? <li className="text-stone-500">初期登録の下書きです</li> : null}
            </ol>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
