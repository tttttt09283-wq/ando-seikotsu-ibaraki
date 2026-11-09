import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRule, getRuleVersion, ruleAckStatus } from "@/server/rules";
import { acknowledgeRule, createDraft } from "../actions";
import { RULE_STATUS, appliesLabel, effectiveLabel } from "@/lib/rules";
import { formatDate, formatJstDateTime, jstToday } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { Flash } from "@/components/flash";
import { RuleBody } from "@/components/rule-body";

export const metadata: Metadata = { title: "社内規定" };

export default async function RulePage({ params, searchParams }: { params: Promise<{ no: string }>; searchParams: Promise<{ ok?: string; err?: string; v?: string }> }) {
  const { no } = await params;
  const sp = await searchParams;
  if (!/^\d{3}$/.test(no)) notFound();
  const r = await getRule(no);
  if (!r) notFound();
  const today = jstToday();
  const old = sp.v && /^[0-9a-f-]{36}$/.test(sp.v) && sp.v !== r.current?.id ? await getRuleVersion(sp.v) : null;
  const c = r.current;
  const ack = c && (r.can_edit || r.can_approve) ? await ruleAckStatus(c.id) : [];
  const shown = old ?? c;
  return (
    <>
      <div>
        <Link href="/rules" className="text-sm text-brand-700">‹ 社内規定</Link>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-black text-brand-800"><span className="font-mono text-base text-stone-500">{r.rule_no}</span>{shown?.title ?? r.title}</h1>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      {r.working && (r.can_edit || r.can_approve) ? (
        <Alert tone="info">改定案（第{r.working.version_no}版）：<b>{RULE_STATUS[r.working.status].text}</b>　<Link href={`/rules/${no}/edit`} className="font-bold text-brand-700 underline">改定案を開く</Link></Alert>
      ) : c && r.can_edit ? (
        <form action={createDraft}><input type="hidden" name="rule_id" value={r.rule_id} /><input type="hidden" name="rule_no" value={no} /><SubmitButton variant="outline">この規定の改定案を作る</SubmitButton></form>
      ) : null}

      {old ? <Alert tone="warn">これは<b>旧版（第{old.version_no}版）</b>です。<Link href={`/rules/${no}`} className="font-bold underline">公開中の版を見る</Link></Alert> : null}
      {shown ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">第{shown.version_no}版
              {old ? <Badge>旧版</Badge> : <Badge tone={shown.is_provisional ? "warn" : "ok"}>{effectiveLabel(shown.effective_date, shown.is_provisional, today)}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
              <dt className="text-stone-500">施行日</dt><dd>{formatDate(shown.effective_date)}</dd>
              <dt className="text-stone-500">適用対象</dt><dd>{appliesLabel(shown.applies_to)}</dd>
              {c && !old ? <><dt className="text-stone-500">承認</dt><dd>{c.approved_by_name}（{c.approved_at ? formatJstDateTime(c.approved_at) : "-"}）{c.self_approved ? <Badge tone="warn" className="ml-1">本人承認</Badge> : null}</dd></> : null}
              {shown.change_summary ? <><dt className="text-stone-500">改定内容</dt><dd>{shown.change_summary}</dd></> : null}
            </dl>
            {shown.is_provisional ? <Alert tone="warn">この規定は<b>初期案</b>です。会社の正式承認と労務の確認が終わるまで、施行済みの規定としては扱いません。</Alert> : null}
            <RuleBody body={shown.body} />
            {c && !old ? (
              c.applies_to_me ? (
                c.acknowledged_at ? <Alert tone="ok">{formatJstDateTime(c.acknowledged_at)} に確認しました（第{c.version_no}版）。</Alert>
                : <form action={acknowledgeRule} className="rounded-lg border border-brand-600 bg-brand-50 p-3">
                    <input type="hidden" name="version_id" value={c.id} /><input type="hidden" name="rule_no" value={no} />
                    <p className="mb-2 text-sm">内容を最後まで読んだら、「確認しました」を押してください。</p>
                    <SubmitButton>確認しました</SubmitButton>
                  </form>
              ) : <p className="text-xs text-stone-500">この規定はあなたの確認の対象ではありません（適用対象：{appliesLabel(c.applies_to)}）。</p>
            ) : null}
          </CardContent>
        </Card>
      ) : <Alert tone="info">この規定はまだ公開されていません。</Alert>}

      {ack.length ? (
        <Card>
          <CardHeader><CardTitle>確認の状況（第{c!.version_no}版）：{ack.filter((a) => a.acknowledged_at).length}/{ack.length}人</CardTitle></CardHeader>
          <CardContent>
            <details>
              <summary className="cursor-pointer text-sm font-bold text-brand-700">未確認の人（{ack.filter((a) => !a.acknowledged_at).length}人）を表示</summary>
              <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                {ack.filter((a) => !a.acknowledged_at).map((a) => <li key={a.user_id}>{a.name}<span className="ml-2 text-xs text-stone-500">{a.store_name ?? ""}</span></li>)}
              </ul>
            </details>
          </CardContent>
        </Card>
      ) : null}

      {r.history.length ? (
        <Card>
          <CardHeader><CardTitle>改定履歴</CardTitle></CardHeader>
          <CardContent>
            <ol className="grid gap-2 text-sm">
              {r.history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-baseline gap-2 border-l-2 border-brand-100 pl-3">
                  <Link href={h.status === "published" ? `/rules/${no}` : `/rules/${no}?v=${h.id}`} className="font-bold text-brand-700">第{h.version_no}版</Link>
                  <Badge tone={RULE_STATUS[h.status].tone}>{RULE_STATUS[h.status].text}</Badge>
                  {h.is_provisional ? <Badge tone="warn">初期案</Badge> : null}
                  <span className="text-xs text-stone-500">施行日 {formatDate(h.effective_date)}・公開 {formatJstDateTime(h.published_at)}・承認 {h.approved_by_name}{h.self_approved ? "（本人承認）" : ""}</span>
                  {h.change_summary ? <span className="w-full text-stone-700">{h.change_summary}</span> : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}
      {!shown && r.working ? <Button asChild><Link href={`/rules/${no}/edit`}>下書きを開く</Link></Button> : null}
    </>
  );
}
