"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarCheck, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLearning } from "@/lib/learning-store";
import { dueItems, upcomingItems } from "@/lib/stats";
import { lessonMap } from "@/data/curriculum";
import { QuestionCard } from "@/components/quiz/question-card";
import { FlashCards } from "@/components/lesson/review-step";
import { formatJpDate } from "@/lib/dates";
import { INTERVALS } from "@/lib/review";

export function ReviewSession() {
  const { state, hydrated, today } = useLearning();
  if (!hydrated) return <p className="text-sm text-muted-foreground">読み込み中…</p>;
  // 開始時点の対象を固定する（回答で一覧が並び替わらないように）
  return <ReviewQueue initialIds={dueItems(state, today).map((i) => i.id)} />;
}

function ReviewQueue({ initialIds }: { initialIds: string[] }) {
  const { state, today, answerReview } = useLearning();
  const [queue] = React.useState(initialIds);
  const [pos, setPos] = React.useState(0);
  const [done, setDone] = React.useState(0);

  const upcoming = upcomingItems(state, 14, today);
  const currentId = queue[pos];
  const item = currentId ? state.reviewItems[currentId] : undefined;

  const advance = () => {
    setDone((d) => d + 1);
    setPos((p) => p + 1);
  };

  return (
    <div className="space-y-6">
      {item ? (
        <section className="space-y-4 rounded-xl border bg-white p-4 sm:p-6">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {pos + 1} / {queue.length} 件目
            </span>
            <span>
              {lessonMap[item.lessonId]?.title} ・ 定着度 {item.box + 1}/{INTERVALS.length}
            </span>
          </div>
          {item.type === "question" ? (
            (() => {
              const q = lessonMap[item.lessonId]?.quiz?.find((x) => x.id === item.refId);
              if (!q) return <p className="text-sm">問題が見つかりません。</p>;
              return <QuestionCard key={item.id} question={q} onAnswered={(c) => answerReview(item.id, c)} onNext={advance} nextLabel="次の復習へ" />;
            })()
          ) : (
            <LessonRecall
              key={item.id}
              lessonId={item.lessonId}
              onRate={(ok) => {
                answerReview(item.id, ok);
                advance();
              }}
            />
          )}
        </section>
      ) : (
        <section className="rounded-xl border bg-white p-6 text-center">
          <CalendarCheck className="mx-auto size-10 text-ok" />
          <p className="mt-3 font-semibold">{done > 0 ? `${done}件の復習が終わりました` : "今日復習する項目はありません"}</p>
          <p className="mt-1 text-sm text-muted-foreground">小テストで間違えた問題や、完了した講義がここに表示されます。</p>
          <Button asChild className="mt-4">
            <Link href="/curriculum">講義を進める</Link>
          </Button>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-bold text-primary">今後2週間の復習予定</h2>
        {upcoming.length ? (
          <ul className="divide-y rounded-xl border bg-white">
            {upcoming.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="w-12 shrink-0 font-semibold text-primary tabular-nums">{formatJpDate(u.due)}</span>
                <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] text-primary">{u.type === "question" ? "問題" : "講義"}</span>
                <span className="line-clamp-1 flex-1">{u.label}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">予定はありません。</p>
        )}
      </section>
    </div>
  );
}

function LessonRecall({ lessonId, onRate }: { lessonId: string; onRate: (ok: boolean) => void }) {
  const lesson = lessonMap[lessonId];
  const [shown, setShown] = React.useState(false);
  if (!lesson?.review) return null;
  return (
    <div className="space-y-4">
      <p className="text-[15px] font-medium">「{lesson.title}」の要点を思い出してから、カードをめくって確認しましょう。</p>
      <FlashCards cards={lesson.review.cards} />
      {!shown ? (
        <Button variant="outline" className="w-full" onClick={() => setShown(true)}>
          要点の一覧を表示
        </Button>
      ) : (
        <ul className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
          {lesson.review.keyPoints.map((k) => (
            <li key={k}>・{k}</li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="lg" onClick={() => onRate(false)}>
          <X />
          あいまいだった
        </Button>
        <Button size="lg" onClick={() => onRate(true)}>
          <Check />
          思い出せた
        </Button>
      </div>
    </div>
  );
}
