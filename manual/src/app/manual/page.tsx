import Link from "next/link";
import { DocList } from "@/components/DocList";
import { Shell } from "@/components/Shell";
import { btnGhost, PageTitle } from "@/components/ui";
import { requireActor } from "@/lib/auth";
import { canPropose, canViewManagerManual, isTop } from "@/lib/authz";
import type { Kind } from "@/lib/config";
import { sql } from "@/lib/db";
import { listDocs } from "@/lib/repo/docs";

export const metadata = { title: "マニュアル" };

const TABS: { kind: Kind; label: string }[] = [
  { kind: "staff_manual", label: "スタッフ業務" },
  { kind: "training", label: "教育資料・説明トーク" },
  { kind: "manager_manual", label: "院長・管理職" },
];

export default async function ManualPage({ searchParams }: { searchParams: Promise<{ kind?: string; category?: string; drafts?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const tabs = TABS.filter((t) => t.kind !== "manager_manual" || canViewManagerManual(actor));
  const kind = tabs.find((t) => t.kind === sp.kind)?.kind ?? "staff_manual";
  const docs = await listDocs(sql(), actor, { kinds: [kind] });
  const showDrafts = isTop(actor) && sp.drafts === "1";
  return (
    <Shell actor={actor} active="manual">
      <PageTitle title="マニュアル" lead="既存の「整骨院スタッフ業務・行動マニュアル」を項目ごとに分けたものです。承認されたものから公開されます。">
        <div className="flex gap-2">
          {isTop(actor) && <Link href={showDrafts ? `/manual?kind=${kind}` : `/manual?kind=${kind}&drafts=1`} className={btnGhost}>{showDrafts ? "公開中だけ" : "未公開も表示"}</Link>}
          {canPropose(actor) && <Link href={`/docs/new?kind=${kind}`} className={btnGhost}>＋ 提案</Link>}
        </div>
      </PageTitle>
      <div className="mb-3 flex gap-1 border-b border-neutral-200">
        {tabs.map((t) => (
          <Link key={t.kind} href={`/manual?kind=${t.kind}`} className={`-mb-px border-b-2 px-3 py-2 text-sm font-bold ${kind === t.kind ? "border-navy text-navy" : "border-transparent text-neutral-500"}`}>{t.label}</Link>
        ))}
      </div>
      {kind === "manager_manual" && !docs.length && (
        <p className="mb-3 rounded-lg bg-navy-50 px-3 py-2 text-sm text-navy">院長マニュアル（全10章）は次の段階（MVP-3）で、目次に沿って登録します。</p>
      )}
      <DocList docs={docs} path="/manual" params={{ kind, ...(showDrafts ? { drafts: "1" } : {}) }} category={sp.category} showDrafts={showDrafts} />
    </Shell>
  );
}
