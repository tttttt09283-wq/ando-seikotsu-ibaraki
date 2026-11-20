"use client";

import * as React from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { QuizQuestion } from "@/data/types";

export function isCorrect(selected: string[], answer: string[]) {
  return selected.length === answer.length && answer.every((a) => selected.includes(a));
}

export function QuestionCard({
  question,
  index,
  total,
  onAnswered,
  onNext,
  nextLabel = "次へ",
}: {
  question: QuizQuestion;
  index?: number;
  total?: number;
  onAnswered?: (correct: boolean, selected: string[]) => void;
  onNext?: () => void;
  nextLabel?: string;
}) {
  const [selected, setSelected] = React.useState<string[]>([]);
  const [submitted, setSubmitted] = React.useState(false);
  const correct = submitted && isCorrect(selected, question.answer);

  const toggle = (id: string) => {
    if (submitted) return;
    if (question.type === "single") setSelected([id]);
    else setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const submit = () => {
    setSubmitted(true);
    onAnswered?.(isCorrect(selected, question.answer), selected);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {index !== undefined && total !== undefined ? (
          <span>
            第{index + 1}問 / 全{total}問
          </span>
        ) : (
          <span />
        )}
        <span className="rounded bg-muted px-2 py-0.5">{question.type === "single" ? "1つ選択" : "すべて選択"}</span>
      </div>
      <p className="text-[15px] leading-relaxed font-medium">{question.prompt}</p>
      <div className="grid gap-2" role={question.type === "single" ? "radiogroup" : "group"}>
        {question.options.map((o) => {
          const isSel = selected.includes(o.id);
          const isAns = question.answer.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              role={question.type === "single" ? "radio" : "checkbox"}
              aria-checked={isSel}
              onClick={() => toggle(o.id)}
              disabled={submitted}
              className={cn(
                "flex min-h-12 items-center gap-3 rounded-lg border bg-white px-4 py-3 text-left text-sm transition-colors",
                !submitted && "hover:border-primary/50 hover:bg-accent/50",
                isSel && !submitted && "border-primary bg-accent ring-1 ring-primary",
                submitted && isAns && "border-ok bg-emerald-50",
                submitted && isSel && !isAns && "border-destructive bg-red-50",
              )}
            >
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center border text-[10px]",
                  question.type === "single" ? "rounded-full" : "rounded",
                  isSel ? "border-primary bg-primary text-white" : "border-input",
                )}
                aria-hidden
              >
                {isSel ? "✓" : ""}
              </span>
              <span className="flex-1">{o.text}</span>
              {submitted && isAns && <CheckCircle2 className="size-4 text-ok" />}
              {submitted && isSel && !isAns && <XCircle className="size-4 text-destructive" />}
            </button>
          );
        })}
      </div>

      {submitted && (
        <div className={cn("rounded-lg border p-4 text-sm leading-relaxed", correct ? "border-ok/30 bg-emerald-50" : "border-destructive/30 bg-red-50")} aria-live="polite">
          <p className={cn("mb-1 font-semibold", correct ? "text-ok" : "text-destructive")}>{correct ? "正解" : "不正解"}</p>
          <p className="text-foreground/90">{question.explanation}</p>
        </div>
      )}

      <div className="flex justify-end">
        {!submitted ? (
          <Button size="lg" onClick={submit} disabled={!selected.length} className="w-full sm:w-auto">
            回答する
          </Button>
        ) : (
          onNext && (
            <Button size="lg" onClick={onNext} className="w-full sm:w-auto">
              {nextLabel}
            </Button>
          )
        )}
      </div>
    </div>
  );
}
