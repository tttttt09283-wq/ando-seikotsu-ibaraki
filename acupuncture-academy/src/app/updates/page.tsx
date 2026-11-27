import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { changelog, contentVersion, lessonRevision } from "@/data/changelog";
import { lessonMap, chapterMap } from "@/data/curriculum";
import { UpdatedForYou } from "./updated-for-you";

export const metadata: Metadata = { title: "更新情報" };

const fmt = (d: string) => d.replaceAll("-", "/");

export default function UpdatesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="UPDATES"
        title="教材の更新情報"
        description={`教材は監修・最新の資料にあわせて順次更新します。現在の教材データは ${fmt(contentVersion)} 版です。学習済みの講義が更新されると、ホームと講義の画面でお知らせします。`}
      />
      <UpdatedForYou />
      <ol className="relative space-y-5 border-l-2 border-primary/15 pl-5">
        {changelog.map((c) => (
          <li key={c.date + c.title} className="relative">
            <span className="absolute top-1.5 -left-[27px] size-3 rounded-full border-2 border-primary bg-white" />
            <p className="text-xs font-semibold text-muted-foreground">{fmt(c.date)}</p>
            <h2 className="text-base font-bold text-primary">{c.title}</h2>
            <ul className="mt-2 space-y-1 text-sm leading-relaxed">
              {c.items.map((i) => (
                <li key={i}>・{i}</li>
              ))}
            </ul>
            {c.lessonIds && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {c.lessonIds.map((id) => {
                  const l = lessonMap[id];
                  if (!l) return null;
                  return (
                    <Link key={id} href={`/lessons/${id}`} className="rounded-md border bg-white px-2 py-1 text-xs hover:border-primary/40">
                      第{chapterMap[l.chapterId].number}章 {l.title}（第{lessonRevision(id).revision}版）
                    </Link>
                  );
                })}
              </div>
            )}
            {c.links && (
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {c.links.map((k) => (
                  <Link key={k.href} href={k.href} className="font-semibold text-primary underline">
                    {k.label}
                  </Link>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
