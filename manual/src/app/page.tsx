import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Badge, Card, DocRowLink, Empty, PageTitle } from "@/components/ui";
import { requireActor } from "@/lib/auth";
import { canSeeReviewQueue, isPresident, isGm } from "@/lib/authz";
import { sql } from "@/lib/db";
import { listDocs, reviewQueue } from "@/lib/repo/docs";

export default async function Home() {
  const actor = await requireActor();
  const all = await listDocs(sql(), actor);
  const published = all.filter((d) => d.current);
  const unacked = published.filter((d) => d.needsAck && !d.acked);
  const queue = canSeeReviewQueue(actor) ? await reviewQueue(sql(), actor) : null;
  const mine = queue ? queue.drafts.filter((d) => d.latest.created_by === actor.memberId) : [];
  return (
    <Shell actor={actor} active="home">
      <PageTitle title="ホーム" />
      <Card title={<>確認が必要なルール {unacked.length > 0 && <Badge tone="red">{unacked.length}</Badge>}</>} right={<Link href="/rules" className="text-sm text-navy underline">一覧</Link>}>
        {unacked.length ? (
          unacked.slice(0, 10).map((d) => <DocRowLink key={d.id} code={d.code} kind={d.kind} title={d.current!.title} status="published" category={d.current!.category} importance={d.current!.importance} right={<Badge tone="red">未確認</Badge>} />)
        ) : (
          <Empty>{published.length ? "すべて確認済みです" : "公開中のルールはまだありません"}</Empty>
        )}
      </Card>

      {queue && (
        <Card title="承認・提案" right={<Link href="/review" className="text-sm text-navy underline">開く</Link>}>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {isGm(actor) || actor.gmDelegations.length ? <Stat label="GM確認待ち" n={queue.gm.length} /> : null}
            {isPresident(actor) ? <Stat label="社長承認待ち" n={queue.president.length} /> : null}
            {(isGm(actor) || isPresident(actor)) && <Stat label="法令確認待ち" n={queue.legal.length} />}
            <Stat label="自分の下書き・差し戻し" n={mine.length} />
          </ul>
        </Card>
      )}

      <Card title="公開中">
        <p className="text-sm text-neutral-700">
          会社ルール {published.filter((d) => d.kind === "rule").length}件 ／ マニュアル・教育資料 {published.filter((d) => d.kind !== "rule").length}件
        </p>
        <p className="mt-2 text-xs text-neutral-500">分からないことは「検索」から。根拠が見つからないときは自己判断せず、院長・GMに確認してください。</p>
      </Card>
    </Shell>
  );
}

function Stat({ label, n }: { label: string; n: number }) {
  return (
    <li className="rounded-lg bg-navy-50 px-3 py-2">
      <div className="text-xs text-neutral-600">{label}</div>
      <div className="text-2xl font-bold text-navy">{n}</div>
    </li>
  );
}
