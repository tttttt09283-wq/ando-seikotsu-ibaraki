import Link from "next/link";
import { Badge, Card, DocRowLink, Empty } from "@/components/ui";
import { CATEGORIES } from "@/lib/config";
import type { DocSummary } from "@/lib/repo/docs";

// 一覧（カテゴリで絞り込み・カテゴリごとにまとめる）。公開中の版を表示し、未公開の改訂があれば印を付ける
export function DocList({ docs, path, params = {}, category, showDrafts }: {
  docs: DocSummary[]; path: string; params?: Record<string, string>; category?: string; showDrafts: boolean;
}) {
  const href = (c?: string) => {
    const qs = new URLSearchParams({ ...params, ...(c ? { category: c } : {}) }).toString();
    return qs ? `${path}?${qs}` : path;
  };
  const rows = docs
    .filter((d) => d.current || showDrafts)
    .filter((d) => !category || (d.current ?? d.latest).category === category);
  const used = new Set(docs.map((d) => (d.current ?? d.latest).category));
  return (
    <>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip href={href()} on={!category}>すべて</Chip>
        {CATEGORIES.filter((c) => used.has(c[0])).map((c) => (
          <Chip key={c[0]} href={href(c[0])} on={category === c[0]}>{c[1]}</Chip>
        ))}
      </div>
      {!rows.length && <Card><Empty>該当する項目はありません</Empty></Card>}
      {CATEGORIES.filter((c) => rows.some((d) => (d.current ?? d.latest).category === c[0])).map((c) => (
        <Card key={c[0]} title={c[1]}>
          {rows.filter((d) => (d.current ?? d.latest).category === c[0]).map((d) => {
            const v = d.current ?? d.latest;
            const revising = d.current && d.latest.id !== d.current.id && showDrafts;
            return (
              <DocRowLink key={d.id} code={d.code} kind={d.kind} title={v.title} status={v.status} category={v.category} importance={v.importance}
                right={<>
                  {d.needsAck && !d.acked && <Badge tone="red">未確認</Badge>}
                  {d.needsAck && d.acked && <Badge tone="green">確認済み</Badge>}
                  {revising && <Badge>改訂中</Badge>}
                </>} />
            );
          })}
        </Card>
      ))}
    </>
  );
}

function Chip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${on ? "border-navy bg-navy text-white" : "border-neutral-300 text-neutral-700"}`}>
      {children}
    </Link>
  );
}
