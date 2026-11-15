import Link from "next/link";
import { notFound } from "next/navigation";
import { bulkReview } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { Shell } from "@/components/Shell";
import { btn, btnGhost, Card, DocRowLink, Empty, ImportanceBadge, input, PageTitle } from "@/components/ui";
import { requireActor } from "@/lib/auth";
import { canPropose, canSeeReviewQueue, gmReviewAuthority, isPresident, isTop } from "@/lib/authz";
import { categoryLabel } from "@/lib/config";
import { sql } from "@/lib/db";
import { reviewQueue, type DocSummary } from "@/lib/repo/docs";

export const metadata = { title: "承認・提案" };

export default async function ReviewPage() {
  const actor = await requireActor();
  if (!canSeeReviewQueue(actor)) notFound();
  const q = await reviewQueue(sql(), actor);
  const mine = isTop(actor) ? q.drafts : q.drafts.filter((d) => d.latest.created_by === actor.memberId);
  return (
    <Shell actor={actor} active="review">
      <PageTitle title="承認・提案" lead="下書き → GM確認 → 社長承認 → 公開。法令確認が必要な項目は社労士の確認後にGM確認へ戻します。">
        {canPropose(actor) && <Link href="/docs/new" className={btnGhost}>＋ 新しい提案</Link>}
      </PageTitle>

      {gmReviewAuthority(actor).ok && <BulkCard title="GM確認待ち" docs={q.gm} action="gm_approve" button="選んだ項目をGM確認OKにする（社長承認へ）" />}
      {isPresident(actor) && <BulkCard title="社長承認待ち" docs={q.president} action="president_approve" button="選んだ項目を承認して公開する" />}
      {!gmReviewAuthority(actor).ok && !isPresident(actor) && isTop(actor) && (
        <Card title="確認待ち"><p className="text-sm">GM確認待ち {q.gm.length}件 ／ 社長承認待ち {q.president.length}件</p></Card>
      )}
      {isTop(actor) && (
        <Card title={`法令確認待ち（${q.legal.length}件）`}>
          <p className="mb-2 text-xs text-neutral-500">社労士に確認してもらい、各項目の画面で「社労士確認済み」を記録してください（確認者・確認日が残ります）。</p>
          {q.legal.length ? q.legal.map((d) => <Row key={d.id} d={d} />) : <Empty>ありません</Empty>}
        </Card>
      )}
      <Card title={isTop(actor) ? `下書き・差し戻し（${mine.length}件）` : `自分の下書き・差し戻し（${mine.length}件）`}>
        {mine.length ? mine.map((d) => <Row key={d.id} d={d} />) : <Empty>ありません</Empty>}
      </Card>
    </Shell>
  );
}

function Row({ d }: { d: DocSummary }) {
  return <DocRowLink code={d.code} kind={d.kind} title={d.latest.title} status={d.latest.status} category={d.latest.category} importance={d.latest.importance} />;
}

function BulkCard({ title, docs, action, button }: { title: string; docs: DocSummary[]; action: string; button: string }) {
  return (
    <Card title={`${title}（${docs.length}件）`}>
      {/* 承認すると一覧が空になるので、結果の表示が消えないようにフォームは常に置いておく */}
      <ActionForm action={bulkReview} confirmText={`${button}。よろしいですか？`}>
        <input type="hidden" name="action" value={action} />
        {docs.length ? (
          <>
            <ul className="mb-3">
              {docs.map((d) => (
                <li key={d.id} className="flex items-start gap-3 border-b border-neutral-100 py-2.5 last:border-0">
                  <input type="checkbox" name="versionId" value={d.latest.id} className="mt-1 size-5 shrink-0" aria-label={d.latest.title} />
                  <Link href={`/docs/${d.code}?v=${d.latest.version_no}`} className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                      <span className="font-mono">{d.code}</span><ImportanceBadge v={d.latest.importance} /><span>{categoryLabel(d.latest.category)}</span>
                      {d.latest.version_no > 1 && <span>・第{d.latest.version_no}版（改訂）</span>}
                    </div>
                    <div className="font-bold underline decoration-neutral-300">{d.latest.title}</div>
                    {d.import_note && <div className="text-xs text-red-800">{d.import_note}</div>}
                  </Link>
                </li>
              ))}
            </ul>
            <input name="comment" className={`${input} mb-2`} placeholder="コメント（任意）" />
            <button className={`${btn} w-full`}>{button}</button>
            <p className="mt-2 text-xs text-neutral-500">内容は各項目を開いて確認してください。差し戻し・法令確認待ちは各項目の画面から行います。</p>
          </>
        ) : (
          <Empty>ありません</Empty>
        )}
      </ActionForm>
    </Card>
  );
}
