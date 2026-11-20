"use client";

import type { Chapter } from "@/data/types";
import { useLearning } from "@/lib/learning-store";
import { Progress } from "@/components/ui/progress";

export function ChapterProgress({ chapter }: { chapter: Chapter }) {
  const { state } = useLearning();
  const comp = chapter.lessons.filter((l) => state.lessons[l.id]?.status === "completed").length;
  const pub = chapter.lessons.filter((l) => l.status === "published").length;
  return (
    <div className="flex items-center gap-3">
      <Progress value={(comp / chapter.lessons.length) * 100} className="h-1.5 flex-1" />
      <span className="shrink-0 text-xs text-muted-foreground">
        完了 {comp}/{chapter.lessons.length}・公開 {pub}
      </span>
    </div>
  );
}
