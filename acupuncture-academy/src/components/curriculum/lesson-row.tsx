"use client";

import Link from "next/link";
import { CheckCircle2, ChevronRight, CircleDashed, Clock, PlayCircle } from "lucide-react";
import type { Lesson } from "@/data/types";
import { useLearning } from "@/lib/learning-store";
import { bestScore } from "@/lib/stats";
import { lessonRevision } from "@/data/changelog";
import { cn } from "@/lib/utils";

export function LessonRow({ lesson }: { lesson: Lesson }) {
  const { state } = useLearning();
  const p = state.lessons[lesson.id];
  const best = bestScore(state, lesson.id);
  const published = lesson.status === "published";
  const rev = lessonRevision(lesson.id);
  const updated = Boolean(p) && (state.seenRevisions?.[lesson.id] ?? 1) < rev.revision;
  const Icon = p?.status === "completed" ? CheckCircle2 : p ? PlayCircle : published ? PlayCircle : CircleDashed;
  const body = (
    <div className={cn("flex items-center gap-3 rounded-lg border bg-white p-3", published ? "hover:border-primary/40" : "opacity-70")}>
      <Icon className={cn("size-5 shrink-0", p?.status === "completed" ? "text-ok" : published ? "text-primary" : "text-slate-400")} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          <span className="mr-1.5 text-xs text-muted-foreground">第{lesson.number}講</span>
          {lesson.title}
          {updated && <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">更新あり</span>}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{lesson.summary}</p>
      </div>
      <div className="shrink-0 text-right text-[11px] text-muted-foreground">
        {published ? (
          <>
            <span className="flex items-center justify-end gap-1">
              <Clock className="size-3" />
              {lesson.minutes}分
            </span>
            {best !== null && <span className="mt-0.5 block font-semibold text-primary">最高 {Math.round(best * 100)}%</span>}
            {rev.revision > 1 && <span className="mt-0.5 block">第{rev.revision}版</span>}
            {p?.status === "in-progress" && best === null && <span className="mt-0.5 block text-primary">学習中</span>}
          </>
        ) : (
          <span className="rounded bg-muted px-1.5 py-0.5">準備中</span>
        )}
      </div>
      {published && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
    </div>
  );
  return published ? <Link href={`/lessons/${lesson.id}`}>{body}</Link> : <div aria-disabled>{body}</div>;
}
