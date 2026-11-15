import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { btnGhost, Card, fmtDateTime, PageTitle } from "@/components/ui";
import { requireActor } from "@/lib/auth";
import { canViewAudit } from "@/lib/authz";
import { sql } from "@/lib/db";

export const metadata = { title: "監査ログ" };

const TABLE_LABEL: Record<string, string> = {
  mn_members: "スタッフ", mn_assignments: "所属", mn_areas: "担当エリア", mn_delegations: "代理", mn_docs: "項目", mn_doc_versions: "版",
  mn_doc_reviews: "承認", mn_doc_conflicts: "矛盾", mn_doc_links: "関連", mn_doc_acks: "確認済み", mn_source_imports: "取り込み",
  mn_source_sections: "原文", mn_clinics: "院", mn_search_synonyms: "言い換え",
};
const PAGE = 100;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ before?: string; table?: string }> }) {
  const actor = await requireActor();
  if (!canViewAudit(actor)) notFound();
  const sp = await searchParams;
  const before = Number(sp.before) || null;
  const table = sp.table && TABLE_LABEL[sp.table] ? sp.table : null;
  const rows = await sql()<{ id: string; actor: string | null; actor_name: string | null; action: string; table_name: string; row_id: string | null; before: unknown; after: unknown; at: Date }[]>`
    select l.id::text, l.actor, m.name as actor_name, l.action, l.table_name, l.row_id, l.before, l.after, l.at
    from mn_audit_log l left join mn_members m on m.id::text = l.actor
    where true ${before ? sql()`and l.id < ${before}` : sql()``} ${table ? sql()`and l.table_name = ${table}` : sql()``}
    order by l.id desc limit ${PAGE}`;
  return (
    <Shell actor={actor} active="admin">
      <div className="mb-2 text-sm"><Link href="/admin" className="text-navy underline">← 管理者設定</Link></div>
      <PageTitle title="監査ログ" lead="すべての変更（誰が・いつ・何を・変更前後）を記録しています。このログは書き換え・削除できません。" />
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
        <Link href="/admin/audit" className={`shrink-0 rounded-full border px-3 py-1 text-xs ${!table ? "border-navy bg-navy text-white" : ""}`}>すべて</Link>
        {Object.entries(TABLE_LABEL).map(([k, v]) => <Link key={k} href={`/admin/audit?table=${k}`} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${table === k ? "border-navy bg-navy text-white" : ""}`}>{v}</Link>)}
      </div>
      <Card>
        <ul className="divide-y divide-neutral-100 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="py-2">
              <details>
                <summary className="cursor-pointer">
                  <span className="text-xs text-neutral-500">{fmtDateTime(r.at)}</span>　<b>{r.actor_name ?? (r.actor === "system" || !r.actor ? "システム" : r.actor)}</b>
                  {TABLE_LABEL[r.table_name] ?? r.table_name}を{r.action === "insert" ? "追加" : r.action === "update" ? "変更" : "削除"}
                </summary>
                <pre className="mt-1 max-h-64 overflow-auto rounded bg-neutral-50 p-2 text-xs">{JSON.stringify({ before: r.before, after: r.after }, null, 1)}</pre>
              </details>
            </li>
          ))}
        </ul>
        {rows.length === PAGE && (
          <Link href={`/admin/audit?before=${rows[rows.length - 1].id}${table ? `&table=${table}` : ""}`} className={`${btnGhost} mt-3`}>さらに前を表示</Link>
        )}
      </Card>
    </Shell>
  );
}
