"use client";

import * as React from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { FlashCard } from "@/data/types";

export function FlashCards({ cards }: { cards: FlashCard[] }) {
  const [flipped, setFlipped] = React.useState<Record<number, boolean>>({});
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((c, i) => (
        <button
          key={c.front}
          type="button"
          onClick={() => setFlipped((f) => ({ ...f, [i]: !f[i] }))}
          className={cn(
            "flex min-h-28 flex-col justify-between rounded-xl border p-4 text-left transition-colors",
            flipped[i] ? "border-primary bg-primary text-primary-foreground" : "bg-white hover:border-primary/40",
          )}
          aria-pressed={!!flipped[i]}
        >
          <span className="text-[15px] leading-relaxed font-medium">{flipped[i] ? c.back : c.front}</span>
          <span className={cn("mt-3 flex items-center gap-1 text-xs", flipped[i] ? "text-primary-foreground/70" : "text-muted-foreground")}>
            <RotateCw className="size-3" />
            {flipped[i] ? "答え（タップで問題に戻る）" : "タップで答えを表示"}
          </span>
        </button>
      ))}
    </div>
  );
}

export function ReviewStep({ keyPoints, cards, completed }: { keyPoints: string[]; cards: FlashCard[]; completed: boolean }) {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-white p-4">
        <h3 className="mb-3 text-base font-bold text-primary">この講義の要点</h3>
        <ol className="space-y-2">
          {keyPoints.map((k, i) => (
            <li key={k} className="flex gap-3 text-[15px] leading-relaxed">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-primary">{i + 1}</span>
              {k}
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h3 className="mb-3 text-base font-bold text-primary">確認カード</h3>
        <FlashCards cards={cards} />
      </section>
      <section className="rounded-xl border bg-accent/50 p-4 text-sm leading-relaxed">
        {completed ? (
          <p>
            講義は完了済みです。明日、振り返りが復習リストに表示されます。間違えた問題は
            <Link href="/review" className="mx-1 font-semibold text-primary underline">
              復習
            </Link>
            から解き直せます。
          </p>
        ) : (
          <p>小テストに合格すると講義が完了になり、復習スケジュールに登録されます。</p>
        )}
      </section>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild size="lg" variant="outline">
          <Link href="/eight-confluent">次の学習：八脈交会穴を見る</Link>
        </Button>
        <Button asChild size="lg">
          <Link href="/curriculum">カリキュラムに戻る</Link>
        </Button>
      </div>
    </div>
  );
}
