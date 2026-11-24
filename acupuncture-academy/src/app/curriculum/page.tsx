import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { chapters } from "@/data/curriculum";
import { PageHeader } from "@/components/common/page-header";
import { ChapterProgress } from "@/components/curriculum/chapter-progress";

export const metadata: Metadata = { title: "カリキュラム" };

export default function CurriculumPage() {
  return (
    <div>
      <PageHeader
        eyebrow="CURRICULUM"
        title="段階別カリキュラム"
        description="基礎理論から臨床、神経難病まで全10章。各講義は「解説 → 図解 → 臨床例 → 小テスト → 復習」で進みます。小テストで70%以上正解すると講義が完了になります。"
      />
      <ol className="relative grid gap-3 md:grid-cols-2">
        {chapters.map((c) => {
          const published = c.lessons.some((l) => l.status === "published");
          return (
            <li key={c.id}>
              <Link href={`/curriculum/${c.id}`} className="flex h-full flex-col gap-3 rounded-xl border bg-white p-4 transition-colors hover:border-primary/40">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg text-sm font-bold text-white" style={{ background: c.color }}>
                    {c.number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold">
                      {c.title}
                      {published ? (
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-ok">公開中</span>
                      ) : (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">準備中</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{c.subtitle}</p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </div>
                <ChapterProgress chapter={c} />
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
