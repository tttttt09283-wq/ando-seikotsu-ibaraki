"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardList, RotateCcw, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { ClinicalCase } from "@/data/types";
import { useLearning, useStudyTimer } from "@/lib/learning-store";
import { isCorrect } from "@/components/quiz/question-card";
import { ReviewStatusBadge } from "@/components/common/badges";
import { FictionalCaseNotice } from "@/components/common/notices";

function Findings({ c }: { c: ClinicalCase }) {
  return (
    <dl className="grid gap-px overflow-hidden rounded-lg border bg-border text-sm">
      {c.findings.map((f) => (
        <div key={f.label} className="grid grid-cols-[4.5rem_1fr] bg-white sm:grid-cols-[6rem_1fr]">
          <dt className="bg-muted/60 px-3 py-2 text-xs font-semibold text-muted-foreground">{f.label}</dt>
          <dd className="px-3 py-2 leading-relaxed">{f.text}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CaseRunner({ clinicalCase: c }: { clinicalCase: ClinicalCase }) {
  const { recordCase } = useLearning();
  useStudyTimer(true);
  const [round, setRound] = React.useState(0);
  const [index, setIndex] = React.useState(0);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [submitted, setSubmitted] = React.useState(false);
  const [results, setResults] = React.useState<boolean[]>([]);
  const [finished, setFinished] = React.useState(false);

  const step = c.steps[index];
  const correct = submitted && isCorrect(selected, step.answer);

  const toggle = (id: string) => {
    if (submitted) return;
    if (step.type === "single") setSelected([id]);
    else setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };
  const submit = () => {
    setSubmitted(true);
    setResults((r) => [...r, isCorrect(selected, step.answer)]);
  };
  const next = () => {
    if (index + 1 < c.steps.length) {
      setIndex(index + 1);
      setSelected([]);
      setSubmitted(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      recordCase(c.id, results.filter(Boolean).length, c.steps.length);
      setFinished(true);
    }
  };
  const retry = () => {
    setRound(round + 1);
    setIndex(0);
    setSelected([]);
    setSubmitted(false);
    setResults([]);
    setFinished(false);
  };

  return (
    <div className="space-y-5 pb-6">
      <div>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] text-white">{c.level}</span>
          <ReviewStatusBadge status={c.reviewStatus} short />
        </div>
        <h1 className="text-2xl font-bold text-primary">{c.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{c.profile}</p>
      </div>
      <FictionalCaseNotice />

      <Accordion type="single" collapsible defaultValue="findings" className="rounded-xl border bg-white px-4">
        <AccordionItem value="findings">
          <AccordionTrigger>
            <span className="flex items-center gap-2 text-primary">
              <ClipboardList className="size-4" />
              症例の情報（問診・所見・舌脈）
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <Findings c={c} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {finished ? (
        <section className="space-y-5 rounded-xl border bg-white p-5">
          <p className="text-center text-3xl font-bold text-primary">
            {results.filter(Boolean).length} / {c.steps.length}
            <span className="ml-2 text-base font-medium text-muted-foreground">の判断が適切</span>
          </p>
          <ul className="space-y-1.5">
            {c.steps.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2 text-sm">
                {results[i] ? <CheckCircle2 className="size-4 text-ok" /> : <XCircle className="size-4 text-destructive" />}
                {s.title}
              </li>
            ))}
          </ul>
          <p className="rounded-lg bg-accent/60 p-3 text-sm leading-relaxed">{c.summary}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" size="lg" onClick={retry}>
              <RotateCcw />
              もう一度取り組む
            </Button>
            <Button asChild size="lg">
              <Link href="/eight-confluent">八脈交会穴を復習する</Link>
            </Button>
          </div>
        </section>
      ) : (
        <section key={`${round}-${step.id}`} className="space-y-4 rounded-xl border bg-white p-4 sm:p-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                判断 {index + 1} / {c.steps.length}
              </span>
              <span className="rounded bg-muted px-2 py-0.5">{step.type === "single" ? "1つ選択" : "すべて選択"}</span>
            </div>
            <Progress value={(index / c.steps.length) * 100} className="h-1.5" />
          </div>
          <h2 className="text-lg font-bold text-primary">{step.title}</h2>
          <p className="text-[15px] leading-relaxed">{step.question}</p>
          <div className="grid gap-2">
            {step.options.map((o) => {
              const isSel = selected.includes(o.id);
              const isAns = step.answer.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggle(o.id)}
                  disabled={submitted}
                  aria-pressed={isSel}
                  className={cn(
                    "rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                    !submitted && "hover:border-primary/50",
                    isSel && !submitted && "border-primary bg-accent ring-1 ring-primary",
                    submitted && isAns && "border-ok bg-emerald-50",
                    submitted && isSel && !isAns && "border-destructive bg-red-50",
                  )}
                >
                  <span className="flex items-start gap-2">
                    <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center border text-[10px]", step.type === "single" ? "rounded-full" : "rounded", isSel ? "border-primary bg-primary text-white" : "border-input")}>
                      {isSel ? "✓" : ""}
                    </span>
                    <span className="flex-1">
                      <span className="font-medium">{o.text}</span>
                      {submitted && (
                        <span className={cn("mt-1 block text-xs", isAns ? "text-ok" : "text-muted-foreground")}>
                          {isAns ? "適切：" : "不適切："}
                          {o.rationale}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {submitted && (
            <div className={cn("rounded-lg border p-4 text-sm leading-relaxed", correct ? "border-ok/30 bg-emerald-50" : "border-destructive/30 bg-red-50")} aria-live="polite">
              <p className={cn("mb-1 font-semibold", correct ? "text-ok" : "text-destructive")}>{correct ? "適切な判断です" : "見直しが必要です"}</p>
              <p>{step.explanation}</p>
            </div>
          )}
          <div className="flex justify-end">
            {!submitted ? (
              <Button size="lg" className="w-full sm:w-auto" disabled={!selected.length} onClick={submit}>
                判断を確定する
              </Button>
            ) : (
              <Button size="lg" className="w-full sm:w-auto" onClick={next}>
                {index + 1 < c.steps.length ? "次の判断へ" : "結果を見る"}
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
