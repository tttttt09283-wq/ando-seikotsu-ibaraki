import Link from "next/link";
import { Shell } from "@/components/Shell";
import { btn, Card, Empty, fmtDate, input, PageTitle, StatusBadge } from "@/components/ui";
import { requireActor } from "@/lib/auth";
import { isTop } from "@/lib/authz";
import { categoryLabel, KIND_LABEL } from "@/lib/config";
import { sql } from "@/lib/db";
import { searchDocs } from "@/lib/repo/docs";

export const metadata = { title: "検索" };

const EXAMPLES = ["有給", "遅刻", "口コミ", "次回予約", "身だしなみ", "レジ"];

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; drafts?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 100);
  const drafts = isTop(actor) && sp.drafts === "1";
  const r = q ? await searchDocs(sql(), actor, q, drafts) : null;
  return (
    <Shell actor={actor} active="search">
      <PageTitle title="ルール・マニュアルを探す" />
      <form className="mb-3 flex gap-2" role="search">
        <input name="q" defaultValue={q} className={input} placeholder="例：有給、遅刻、口コミ" aria-label="キーワード" />
        {drafts && <input type="hidden" name="drafts" value="1" />}
        <button className={btn}>検索</button>
      </form>
      <div className="mb-4 flex flex-wrap gap-2">
        {EXAMPLES.map((e) => <Link key={e} href={`/search?q=${encodeURIComponent(e)}`} className="rounded-full border border-neutral-300 px-3 py-1 text-xs">{e}</Link>)}
        {isTop(actor) && <Link href={`/search?q=${encodeURIComponent(q)}${drafts ? "" : "&drafts=1"}`} className="rounded-full border border-navy px-3 py-1 text-xs text-navy">{drafts ? "公開中だけ" : "未公開も含める"}</Link>}
      </div>
      {r && (
        <Card title={`「${q}」の結果 ${r.hits.length}件`}>
          {r.terms.length > 1 && <p className="mb-2 text-xs text-neutral-500">言い換えも含めて検索：{r.terms.join("・")}</p>}
          {r.hits.length ? (
            <ul>
              {r.hits.map((h) => (
                <li key={h.code} className="border-b border-neutral-100 py-3 last:border-0">
                  <Link href={`/docs/${h.code}`} className="block">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                      <span className="font-mono">{h.code}</span><span>{KIND_LABEL[h.kind]}</span><span>・{categoryLabel(h.category)}</span>
                      {h.status !== "published" && <StatusBadge status={h.status} />}
                      <span>・改訂日 {fmtDate(h.effective_on ?? h.updated_at)}</span>
                    </div>
                    <div className="mt-0.5 font-bold text-navy">{h.title}</div>
                    <p className="mt-1 text-sm text-neutral-700">{h.snippet}</p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>
              承認済みのルール・マニュアルに該当する記述が見つかりませんでした。<br />
              自己判断せず、院長・GMに確認してください。
            </Empty>
          )}
        </Card>
      )}
    </Shell>
  );
}
