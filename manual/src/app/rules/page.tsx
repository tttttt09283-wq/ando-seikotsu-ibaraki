import Link from "next/link";
import { DocList } from "@/components/DocList";
import { Shell } from "@/components/Shell";
import { btnGhost, PageTitle } from "@/components/ui";
import { requireActor } from "@/lib/auth";
import { canPropose, isTop } from "@/lib/authz";
import { sql } from "@/lib/db";
import { listDocs } from "@/lib/repo/docs";

export const metadata = { title: "会社ルール" };

export default async function RulesPage({ searchParams }: { searchParams: Promise<{ category?: string; drafts?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const docs = await listDocs(sql(), actor, { kinds: ["rule"] });
  const showDrafts = isTop(actor) && sp.drafts === "1";
  return (
    <Shell actor={actor} active="rules">
      <PageTitle title="会社ルール" lead="社長が承認したルールだけを表示しています。内容を読んだら「確認しました」を押してください。">
        <div className="flex gap-2">
          {isTop(actor) && <Link href={showDrafts ? "/rules" : "/rules?drafts=1"} className={btnGhost}>{showDrafts ? "公開中だけ" : "未公開も表示"}</Link>}
          {canPropose(actor) && <Link href="/docs/new?kind=rule" className={btnGhost}>＋ 提案</Link>}
        </div>
      </PageTitle>
      <DocList docs={docs} path="/rules" params={showDrafts ? { drafts: "1" } : {}} category={sp.category} showDrafts={showDrafts} />
    </Shell>
  );
}
