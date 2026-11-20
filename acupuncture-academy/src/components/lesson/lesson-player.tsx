"use client";

import * as React from "react";
import Link from "next/link";
import { BookText, Check, ChevronLeft, ChevronRight, ClipboardCheck, Lock, Shapes, Stethoscope, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { Chapter, Lesson, LessonStepId } from "@/data/types";
import { useLearning, useStudyTimer } from "@/lib/learning-store";
import { ReviewStatusBadge } from "@/components/common/badges";
import { SourceList } from "@/components/common/source-list";
import { ContentBlockView } from "./content-block";
import { ClinicalExampleView } from "./clinical-example";
import { ReviewStep } from "./review-step";
import { QuizRunner } from "@/components/quiz/quiz-runner";

const steps: { id: LessonStepId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "explain", label: "解説", icon: BookText },
  { id: "figure", label: "図解", icon: Shapes },
  { id: "clinical", label: "臨床例", icon: Stethoscope },
  { id: "quiz", label: "小テスト", icon: ClipboardCheck },
  { id: "review", label: "復習", icon: RotateCcw },
];

export function LessonPlayer({ lesson, chapter }: { lesson: Lesson; chapter: Chapter }) {
  const { state, hydrated, openLesson, setLessonStep, recordQuiz } = useLearning();
  useStudyTimer(true);
  const progress = state.lessons[lesson.id];
  const completed = progress?.status === "completed";
  const [current, setCurrent] = React.useState(0);
  const restored = React.useRef(false);

  React.useEffect(() => {
    if (!hydrated) return;
    openLesson(lesson.id);
    if (!restored.current) {
      restored.current = true;
      const saved = state.lessons[lesson.id]?.stepIndex ?? 0;
      setCurrent(Math.min(saved, steps.length - 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, lesson.id]);

  const reached = Math.max(progress?.stepIndex ?? 0, current);
  const unlocked = (i: number) => completed || (i <= reached + 1 && i < 4) || (i === 4 && completed);

  const go = (i: number) => {
    if (!unlocked(i)) return;
    setCurrent(i);
    if (i > (progress?.stepIndex ?? 0)) setLessonStep(lesson.id, i);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const step = steps[current];

  return (
    <div className="pb-28 lg:pb-10">
      <div className="mb-4">
        <Link href={`/curriculum/${chapter.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
          <ChevronLeft className="size-3.5" />
          第{chapter.number}章 {chapter.title}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-primary">
            第{lesson.number}講 {lesson.title}
          </h1>
          <ReviewStatusBadge status={lesson.reviewStatus} short />
          {completed && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-ok">
              <Check className="size-3" />
              完了
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {lesson.summary}（目安 {lesson.minutes}分）
        </p>
      </div>

      {/* ステップ表示 */}
      <div className="sticky top-14 z-30 -mx-4 mb-5 border-b bg-surface/95 px-4 py-3 backdrop-blur">
        <ol className="grid grid-cols-5 gap-1.5" aria-label="講義のステップ">
          {steps.map((s, i) => {
            const isCur = i === current;
            const done = completed || i < reached || (i === reached && i !== current && i < 4);
            const open = unlocked(i);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  disabled={!open}
                  aria-current={isCur ? "step" : undefined}
                  className={cn(
                    "flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] transition-colors",
                    isCur ? "bg-primary text-primary-foreground" : open ? "bg-white text-foreground hover:bg-accent" : "bg-muted text-muted-foreground",
                  )}
                >
                  {!open ? <Lock className="size-4" /> : done && !isCur ? <Check className="size-4 text-ok" /> : <s.icon className="size-4" />}
                  {s.label}
                </button>
              </li>
            );
          })}
        </ol>
        <Progress value={completed ? 100 : (reached / (steps.length - 1)) * 100} className="mt-2 h-1" aria-label="講義の進捗" />
      </div>

      <div className="space-y-6">
        {step.id === "explain" && (
          <>
            {lesson.objectives && (
              <section className="rounded-xl border bg-white p-4">
                <h2 className="mb-2 text-sm font-bold text-muted-foreground">この講義の到達目標</h2>
                <ul className="space-y-1.5 text-sm">
                  {lesson.objectives.map((o) => (
                    <li key={o} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      {o}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {lesson.explain?.map((b, i) => <ContentBlockView key={i} block={b} />)}
            <SourceList ids={lesson.sourceIds} title="この講義の出典・監修状態" />
          </>
        )}
        {step.id === "figure" && lesson.figures?.map((b, i) => <ContentBlockView key={i} block={b} />)}
        {step.id === "clinical" && lesson.clinical && <ClinicalExampleView example={lesson.clinical} />}
        {step.id === "quiz" && lesson.quiz && (
          <section className="rounded-xl border bg-white p-4 sm:p-6">
            <QuizRunner
              questions={lesson.quiz}
              onFinish={(results) => recordQuiz(lesson.id, results)}
              onContinue={() => {
                setCurrent(4);
                setLessonStep(lesson.id, 4);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          </section>
        )}
        {step.id === "review" && lesson.review && <ReviewStep keyPoints={lesson.review.keyPoints} cards={lesson.review.cards} completed={completed} />}
      </div>

      {/* 片手操作用の前後ボタン */}
      {step.id !== "quiz" && step.id !== "review" && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-white/95 p-3 backdrop-blur lg:static lg:mt-8 lg:border-0 lg:bg-transparent lg:p-0">
          <div className="mx-auto flex max-w-3xl gap-2">
            <Button variant="outline" size="lg" className="flex-1" onClick={() => go(current - 1)} disabled={current === 0}>
              <ChevronLeft />
              戻る
            </Button>
            <Button size="lg" className="flex-[2]" onClick={() => go(current + 1)}>
              {steps[current + 1].label}へ進む
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
