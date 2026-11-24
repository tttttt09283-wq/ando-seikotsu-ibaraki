import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleDashed } from "lucide-react";
import { allLessons, chapterMap, lessonMap } from "@/data/curriculum";
import { LessonPlayer } from "@/components/lesson/lesson-player";
import { Button } from "@/components/ui/button";

export function generateStaticParams() {
  return allLessons.map((l) => ({ lessonId: l.id }));
}

export async function generateMetadata({ params }: PageProps<"/lessons/[lessonId]">): Promise<Metadata> {
  const { lessonId } = await params;
  const l = lessonMap[lessonId];
  return { title: l ? l.title : "講義" };
}

export default async function LessonPage({ params }: PageProps<"/lessons/[lessonId]">) {
  const { lessonId } = await params;
  const lesson = lessonMap[lessonId];
  if (!lesson) notFound();
  const chapter = chapterMap[lesson.chapterId];

  if (lesson.status !== "published") {
    return (
      <div className="mx-auto max-w-xl py-12 text-center">
        <CircleDashed className="mx-auto size-10 text-slate-400" />
        <h1 className="mt-4 text-xl font-bold text-primary">
          第{chapter.number}章 第{lesson.number}講「{lesson.title}」は準備中です
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{lesson.summary}</p>
        <Button asChild className="mt-6">
          <Link href={`/curriculum/${chapter.id}`}>章の一覧に戻る</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <LessonPlayer lesson={lesson} chapter={chapter} />
    </div>
  );
}
