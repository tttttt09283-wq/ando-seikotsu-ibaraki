import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { chapterMap, chapters } from "@/data/curriculum";
import { PageHeader } from "@/components/common/page-header";
import { LessonRow } from "@/components/curriculum/lesson-row";
import { ChapterProgress } from "@/components/curriculum/chapter-progress";

export function generateStaticParams() {
  return chapters.map((c) => ({ chapterId: c.id }));
}

export async function generateMetadata({ params }: PageProps<"/curriculum/[chapterId]">): Promise<Metadata> {
  const { chapterId } = await params;
  const c = chapterMap[chapterId];
  return { title: c ? `第${c.number}章 ${c.title}` : "章" };
}

export default async function ChapterPage({ params }: PageProps<"/curriculum/[chapterId]">) {
  const { chapterId } = await params;
  const chapter = chapterMap[chapterId];
  if (!chapter) notFound();
  const prev = chapters[chapter.number - 2];
  const next = chapters[chapter.number];
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/curriculum" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
        <ChevronLeft className="size-3.5" />
        カリキュラム一覧
      </Link>
      <PageHeader eyebrow={`CHAPTER ${chapter.number}`} title={`第${chapter.number}章 ${chapter.title}`} description={`${chapter.subtitle}。${chapter.description}`} />
      <div className="mb-5">
        <ChapterProgress chapter={chapter} />
      </div>
      <ol className="space-y-2">
        {chapter.lessons.map((l) => (
          <li key={l.id}>
            <LessonRow lesson={l} />
          </li>
        ))}
      </ol>
      {chapter.lessons.every((l) => l.status === "planned") && (
        <p className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          この章の教材は準備中です。
        </p>
      )}
      <div className="mt-8 flex justify-between gap-2 text-sm">
        {prev ? (
          <Link href={`/curriculum/${prev.id}`} className="text-primary hover:underline">
            ← 第{prev.number}章 {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={`/curriculum/${next.id}`} className="text-right text-primary hover:underline">
            第{next.number}章 {next.title} →
          </Link>
        )}
      </div>
    </div>
  );
}
