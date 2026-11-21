"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, CircleDashed, PlayCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useLearning } from "@/lib/learning-store";
import { chapters, lessonMap } from "@/data/curriculum";
import { caseMap } from "@/data/cases";
import { pointMap } from "@/data/points";
import { dueItems, missedPoints, topicStats, upcomingItems, weeklySeries } from "@/lib/stats";
import { WeeklyBars } from "@/components/charts/weekly-bars";
import { formatJpDate } from "@/lib/dates";

export function ProgressView() {
  const { state, hydrated, today, reset, storageLabel } = useLearning();
  if (!hydrated) return <p className="text-sm text-muted-foreground">読み込み中…</p>;

  const weekly = weeklySeries(state, 8, today);
  const maxMin = Math.max(30, ...weekly.map((w) => w.minutes));
  const topics = topicStats(state);
  const missed = missedPoints(state);
  const attempts = [
    ...state.quizAttempts.map((a) => ({ id: a.id, at: a.at, label: `小テスト：${lessonMap[a.lessonId]?.title ?? a.lessonId}`, score: a.score, total: a.total })),
    ...state.caseAttempts.map((a) => ({ id: a.id, at: a.at, label: `症例：${caseMap[a.caseId]?.title ?? a.caseId}`, score: a.score, total: a.total })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const due = dueItems(state, today);
  const upcoming = upcomingItems(state, 30, today);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <WeeklyBars title="週ごとの学習時間" data={weekly.map((w) => ({ start: w.start, value: w.minutes || null }))} max={maxMin} format={(v) => `${v}分`} />
        <WeeklyBars title="週ごとの正答率（小テスト）" data={weekly.map((w) => ({ start: w.start, value: w.accuracy === null ? null : Math.round(w.accuracy * 100) }))} max={100} format={(v) => `${v}%`} emptyLabel="受験なし" />
      </div>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-sm font-bold text-primary">講義の完了状況</h2>
        <div className="space-y-4">
          {chapters.map((c) => (
            <div key={c.id}>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                第{c.number}章 {c.title}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {c.lessons.map((l) => {
                  const p = state.lessons[l.id];
                  const Icon = p?.status === "completed" ? CheckCircle2 : p ? PlayCircle : CircleDashed;
                  const cls = p?.status === "completed" ? "text-ok border-ok/30 bg-emerald-50" : p ? "text-primary border-primary/30 bg-accent" : l.status === "planned" ? "text-slate-400 bg-muted/50" : "bg-white";
                  return (
                    <li key={l.id} className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${cls}`} title={l.status === "planned" ? "準備中" : undefined}>
                      <Icon className="size-3.5" />
                      {l.title}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 text-sm font-bold text-primary">苦手な理論</h2>
          {topics.length ? (
            <ul className="space-y-3">
              {topics.map((t) => (
                <li key={t.topic}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>
                      {t.topic}
                      {t.rate < 0.7 && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-warn">要復習</span>}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {t.correct}/{t.total}（{Math.round(t.rate * 100)}%）
                    </span>
                  </div>
                  <Progress value={t.rate * 100} className="h-1.5" indicatorClassName={t.rate < 0.7 ? "bg-warn" : undefined} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty />
          )}
        </section>

        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 text-sm font-bold text-primary">間違えた経穴</h2>
          {missed.length ? (
            <ul className="flex flex-wrap gap-2">
              {missed.map((m) => (
                <li key={m.code}>
                  <Link href={`/points/${m.code}`} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:border-primary/40">
                    {pointMap[m.code]?.name ?? m.code}
                    <span className="font-mono text-xs text-muted-foreground">{m.code}</span>
                    <span className="rounded bg-red-50 px-1.5 text-[10px] text-warn">{m.count}回</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">間違えた経穴はまだありません。</p>
          )}
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 text-sm font-bold text-primary">テスト結果</h2>
          {attempts.length ? (
            <ul className="divide-y text-sm">
              {attempts.slice(0, 12).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{a.label}</span>
                    <span className="text-xs text-muted-foreground">{new Date(a.at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </span>
                  <span className="shrink-0 font-semibold text-primary tabular-nums">
                    {a.score}/{a.total}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty />
          )}
        </section>

        <section className="rounded-xl border bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-primary">復習スケジュール</h2>
            <Button asChild size="sm" variant={due.length ? "default" : "outline"}>
              <Link href="/review">今日の復習 {due.length}件</Link>
            </Button>
          </div>
          {upcoming.length ? (
            <ul className="divide-y text-sm">
              {upcoming.map((u) => (
                <li key={u.id} className="flex gap-3 py-2">
                  <span className="w-12 shrink-0 font-semibold text-primary tabular-nums">{formatJpDate(u.due)}</span>
                  <span className="line-clamp-1">{u.label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">今後30日の予定はありません。</p>
          )}
        </section>
      </div>

      <section className="flex flex-col gap-3 rounded-xl border border-dashed p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">
          保存先：{storageLabel}。ブラウザのデータを消去すると記録も消えます（ログイン・同期は今後対応予定）。
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (window.confirm("この端末の学習記録をすべて削除します。よろしいですか？")) void reset();
          }}
        >
          <Trash2 />
          記録をリセット
        </Button>
      </section>
    </div>
  );
}

function Empty() {
  return (
    <p className="text-sm text-muted-foreground">
      まだ記録がありません。
      <Link href="/curriculum" className="ml-1 text-primary underline">
        講義を始める
      </Link>
    </p>
  );
}
