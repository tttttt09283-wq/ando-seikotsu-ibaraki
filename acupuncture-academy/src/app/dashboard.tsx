"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, CalendarClock, Clock, Map, Network, PlayCircle, Search, Stethoscope, Table2, Target, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useLearning } from "@/lib/learning-store";
import { chapters, chapterMap, publishedLessons, allLessons } from "@/data/curriculum";
import { completedCount, dueItems, mastery, nextLesson, overallAccuracy, totalStudySeconds } from "@/lib/stats";
import { formatMinutes } from "@/lib/dates";
import { EducationNotice } from "@/components/common/notices";
import { UpdatedForYou } from "./updates/updated-for-you";
import { changelog } from "@/data/changelog";

const steps = ["解説", "図解", "臨床例", "小テスト", "復習"];

export function Dashboard() {
  const { state, hydrated, today } = useLearning();
  const next = nextLesson(state);
  const nextProgress = next ? state.lessons[next.id] : undefined;
  const done = completedCount(state);
  const acc = overallAccuracy(state);
  const mas = mastery(state);
  const due = hydrated ? dueItems(state, today) : [];
  const todaySec = hydrated ? (state.studyLog[today] ?? 0) : 0;
  const resume = state.lastVisited && state.lessons[state.lastVisited.lessonId]?.status === "in-progress";

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl bg-primary p-5 text-primary-foreground sm:p-7">
        <p className="text-xs tracking-widest text-primary-foreground/70">今日の講義</p>
        {next ? (
          <>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
              {next.title}
            </h1>
            <p className="mt-1 text-sm text-primary-foreground/80">
              第{chapterMap[next.chapterId].number}章 {chapterMap[next.chapterId].title}・第{next.number}講 ／ 目安 {next.minutes}分
            </p>
            {hydrated && nextProgress && (
              <p className="mt-3 text-sm">
                前回の続き：<span className="font-semibold">{steps[nextProgress.stepIndex]}</span>から再開
              </p>
            )}
            <Button asChild size="lg" variant="secondary" className="mt-5 w-full bg-white text-primary hover:bg-white/90 sm:w-auto">
              <Link href={`/lessons/${next.id}`}>
                <PlayCircle />
                {resume || nextProgress ? "続きから再開する" : "講義を始める"}
              </Link>
            </Button>
          </>
        ) : (
          <>
            <h1 className="mt-2 text-2xl font-bold">公開中の講義はすべて完了しました</h1>
            <p className="mt-1 text-sm text-primary-foreground/80">復習で知識を定着させましょう。新しい講義は順次公開予定です。</p>
            <Button asChild size="lg" variant="secondary" className="mt-5 bg-white text-primary">
              <Link href="/review">復習する</Link>
            </Button>
          </>
        )}
      </section>

      <UpdatedForYou compact />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={BookOpen} label="完了した講義" value={`${done} / ${publishedLessons.length}`} sub={`全${allLessons.length}講（公開${publishedLessons.length}）`} />
        <Stat icon={Target} label="正答率" value={acc === null ? "—" : `${Math.round(acc * 100)}%`} sub="小テスト・症例の累計" />
        <Stat icon={TrendingUp} label="習熟度" value={`${Math.round(mas * 100)}%`} sub="得点と復習の定着" />
        <Stat icon={Clock} label="今日の学習時間" value={formatMinutes(todaySec)} sub={`累計 ${formatMinutes(totalStudySeconds(state))}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-primary">学習進捗</CardTitle>
            <CardDescription>全10章の段階別カリキュラム</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {chapters.map((c) => {
              const pub = c.lessons.filter((l) => l.status === "published");
              const comp = c.lessons.filter((l) => state.lessons[l.id]?.status === "completed").length;
              const pct = c.lessons.length ? (comp / c.lessons.length) * 100 : 0;
              return (
                <Link key={c.id} href={`/curriculum/${c.id}`} className="block rounded-lg p-2 -m-2 hover:bg-accent/50">
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate">
                      <span className="mr-2 text-xs font-bold text-muted-foreground">第{c.number}章</span>
                      <span className="font-medium">{c.title}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {pub.length ? `${comp}/${c.lessons.length}講` : "準備中"}
                    </span>
                  </div>
                  <Progress value={pct} className="h-1.5" indicatorClassName={pub.length ? undefined : "bg-slate-300"} />
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <CalendarClock className="size-5" />
              復習が必要な項目
            </CardTitle>
            <CardDescription>間違えた問題と、完了した講義の振り返り</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!hydrated ? (
              <p className="text-sm text-muted-foreground">読み込み中…</p>
            ) : due.length === 0 ? (
              <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">今日復習する項目はありません。</p>
            ) : (
              <ul className="space-y-2">
                {due.slice(0, 4).map((d) => (
                  <li key={d.id} className="rounded-lg border p-3 text-sm leading-snug">
                    <span className="mr-2 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-primary">{d.type === "question" ? "問題" : "講義"}</span>
                    {d.label}
                  </li>
                ))}
              </ul>
            )}
            <Button asChild variant={due.length ? "default" : "outline"} className="w-full">
              <Link href="/review">
                復習を始める{due.length ? `（${due.length}件）` : ""}
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-base font-bold text-primary">学習ツール</h2>
        <UpdatedForYou compact />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Tool href="/meridians" icon={Map} title="経絡マップ" desc="十二経脈の模式図" />
          <Tool href="/points" icon={Search} title="経穴辞典" desc="検索・お気に入り" />
          <Tool href="/key-points" icon={Table2} title="要穴一覧" desc="分類ごとの一覧表" />
          <Tool href="/eight-confluent" icon={Network} title="八脈交会穴" desc="4組のつながり" />
          <Tool href="/cases" icon={Stethoscope} title="症例演習" desc="7段階の臨床判断" />
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-primary">教材の更新情報</h2>
          <Link href="/updates" className="text-xs font-semibold text-primary underline">
            すべて見る
          </Link>
        </div>
        <ul className="space-y-1 text-sm">
          {changelog.slice(0, 2).map((c) => (
            <li key={c.date + c.title} className="flex gap-3">
              <span className="w-20 shrink-0 text-xs text-muted-foreground tabular-nums">{c.date.replaceAll("-", "/")}</span>
              <span>{c.title}</span>
            </li>
          ))}
        </ul>
      </section>

      <EducationNotice />
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-primary tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function Tool({ href, icon: Icon, title, desc }: { href: string; icon: React.ComponentType<{ className?: string }>; title: string; desc: string }) {
  return (
    <Link href={href} className="group flex flex-col gap-2 rounded-xl border bg-white p-4 transition-colors hover:border-primary/40">
      <span className="grid size-9 place-items-center rounded-lg bg-accent text-primary">
        <Icon className="size-5" />
      </span>
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-xs text-muted-foreground">{desc}</span>
    </Link>
  );
}
