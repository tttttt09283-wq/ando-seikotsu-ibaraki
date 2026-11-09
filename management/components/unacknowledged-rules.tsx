import Link from "next/link";
import { myUnacknowledgedRules } from "@/server/rules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// 自分が未確認の規定（公開中の版）
export async function UnacknowledgedRules() {
  const rows = await myUnacknowledgedRules();
  if (!rows.length) return null;
  return (
    <Card className="border-amber-400">
      <CardHeader><CardTitle>確認していない社内規定（{rows.length}件）</CardTitle><Link href="/rules" className="text-sm font-bold text-brand-700">規定一覧 ›</Link></CardHeader>
      <CardContent>
        <ul className="divide-y divide-stone-100">
          {rows.map((r) => (
            <li key={r.version_id}><Link href={`/rules/${r.rule_no}`} className="flex flex-wrap items-center gap-2 py-2.5 text-sm hover:text-brand-700">
              <span className="font-mono text-stone-500">{r.rule_no}</span><b>{r.title}</b><span className="text-xs text-stone-500">第{r.version_no}版</span>
              {r.is_provisional ? <Badge tone="warn">初期案</Badge> : null}<span className="ml-auto text-xs font-bold text-brand-700">読んで確認する ›</span>
            </Link></li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
