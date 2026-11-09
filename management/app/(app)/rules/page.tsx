import type { Metadata } from "next";
import Link from "next/link";
import { listRules } from "@/server/rules";
import { RULE_STATUS, effectiveLabel } from "@/lib/rules";
import { formatDate, jstToday } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/flash";
import { can } from "@/server/session";

export const metadata: Metadata = { title: "社内規定" };

export default async function RulesPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const [rows, canEdit] = await Promise.all([listRules(), can("rule.edit")]);
  const today = jstToday();
  const unack = rows.filter((r) => r.current_version_id && r.applies_to_me && !r.acknowledged_at).length;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black text-brand-800">社内規定</h1>
        {canEdit ? <Button asChild variant="outline"><Link href="/rules/new">＋ 新しい規定</Link></Button> : null}
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      {unack ? <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">まだ確認していない規定が{unack}件あります。開いて内容を読み、「確認しました」を押してください。</p> : null}
      <Card>
        <CardHeader><CardTitle>規定の一覧</CardTitle></CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-stone-100">
            {rows.map((r) => (
              <li key={r.rule_id}>
                <Link href={`/rules/${r.rule_no}`} className="grid gap-1 px-4 py-3 hover:bg-stone-50">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-stone-500">{r.rule_no}</span><b>{r.title}</b>
                    {r.current_version_id ? <Badge tone={r.is_provisional ? "warn" : "ok"}>{effectiveLabel(r.effective_date, !!r.is_provisional, today)}</Badge> : <Badge tone="neutral">未公開</Badge>}
                    {r.current_version_id && r.applies_to_me ? (r.acknowledged_at ? <Badge tone="ok">確認済み</Badge> : <Badge tone="danger">未確認</Badge>) : null}
                    {r.working_status ? <Badge tone={RULE_STATUS[r.working_status].tone}>改定案（第{r.working_version_no}版）：{RULE_STATUS[r.working_status].text}</Badge> : null}
                  </div>
                  <p className="text-xs text-stone-500">
                    {r.current_version_id ? `第${r.current_version_no}版・施行日 ${formatDate(r.effective_date)}` : "まだ公開されていません"}
                    {r.target_count != null ? `　確認 ${r.ack_count}/${r.target_count}人` : ""}
                  </p>
                </Link>
              </li>
            ))}
            {rows.length === 0 ? <li className="px-4 py-6 text-center text-sm text-stone-500">公開されている規定はまだありません</li> : null}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
