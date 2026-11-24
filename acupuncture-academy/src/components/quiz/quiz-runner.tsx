"use client";

import * as React from "react";
import { Award, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { QuizQuestion } from "@/data/types";
import type { QuestionResult } from "@/lib/repository/types";
import { PASS_RATE } from "@/lib/learning-store";
import { QuestionCard } from "./question-card";

export function QuizRunner({
  questions,
  onFinish,
  onContinue,
}: {
  questions: QuizQuestion[];
  onFinish: (results: QuestionResult[]) => { passed: boolean; score: number; total: number };
  onContinue: () => void;
}) {
  const [round, setRound] = React.useState(0);
  const [index, setIndex] = React.useState(0);
  const [results, setResults] = React.useState<QuestionResult[]>([]);
  const [summary, setSummary] = React.useState<{ passed: boolean; score: number; total: number } | null>(null);

  const q = questions[index];

  const answered = (correct: boolean) => {
    setResults((r) => [...r, { questionId: q.id, correct, topic: q.topic, pointCodes: q.pointCodes }]);
  };

  const next = () => {
    if (index + 1 < questions.length) {
      setIndex(index + 1);
    } else {
      setSummary(onFinish(results));
    }
  };

  const retry = () => {
    setRound((r) => r + 1);
    setIndex(0);
    setResults([]);
    setSummary(null);
  };

  if (summary) {
    const rate = Math.round((summary.score / summary.total) * 100);
    const wrong = questions.filter((qq) => results.find((r) => r.questionId === qq.id && !r.correct));
    return (
      <div className="space-y-5 text-center">
        <div className={summary.passed ? "mx-auto grid size-16 place-items-center rounded-full bg-emerald-50 text-ok" : "mx-auto grid size-16 place-items-center rounded-full bg-amber-50 text-verify"}>
          <Award className="size-8" />
        </div>
        <div>
          <p className="text-3xl font-bold text-primary">
            {summary.score} / {summary.total}
            <span className="ml-2 text-base font-medium text-muted-foreground">（{rate}%）</span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {summary.passed
              ? "合格です。講義を完了として記録しました。最後に要点を復習しましょう。"
              : `合格ラインは${Math.round(PASS_RATE * 100)}%です。解説を見直してもう一度挑戦しましょう。`}
          </p>
        </div>
        {wrong.length > 0 && (
          <div className="rounded-lg border bg-muted/40 p-4 text-left text-sm">
            <p className="mb-2 font-semibold">間違えた問題（復習リストに追加しました）</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {wrong.map((w) => (
                <li key={w.id}>{w.prompt}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" size="lg" onClick={retry}>
            <RotateCcw />
            もう一度解く
          </Button>
          {summary.passed && (
            <Button size="lg" onClick={onContinue}>
              復習へ進む
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Progress value={(index / questions.length) * 100} aria-label="小テストの進捗" />
      <QuestionCard
        key={`${round}-${q.id}`}
        question={q}
        index={index}
        total={questions.length}
        onAnswered={answered}
        onNext={next}
        nextLabel={index + 1 < questions.length ? "次の問題へ" : "結果を見る"}
      />
    </div>
  );
}
