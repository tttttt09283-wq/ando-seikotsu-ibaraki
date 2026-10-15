"use client";

import Link from "next/link";
import {
  ArrowRight,
  CircleCheck,
  CircleDashed,
  Cpu,
  ListChecks,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatJpy, formatJpyPrecise, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { ActivityStream } from "./ActivityStream";
import { CommandBox } from "./CommandBox";
import { CompanyMap, StatusLegend } from "./CompanyMap";
import { useCompany, useNow } from "./StateProvider";

function greeting(now: Date): string {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", hour: "numeric", hour12: false }).format(now));
  if (h < 11) return "おはようございます";
  if (h < 18) return "お疲れさまです";
  return "こんばんは";
}

function Tile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  tag,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "chad" | "amber" | "emerald";
  tag?: "実績" | "DEMO" | "推定";
  href?: string;
}) {
  const body = (
    <div
      className={cn(
        "bg-card h-full rounded-xl border p-4 shadow-xs transition",
        href && "hover:shadow-md",
        tone === "amber" && "border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/40",
      )}
    >
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Icon className={cn("size-3.5", tone === "chad" && "text-chad", tone === "emerald" && "text-emerald-600")} />
        <span className="flex-1 truncate">{label}</span>
        {tag && (
          <span
            className={cn(
              "rounded px-1 text-[10px] font-bold",
              tag === "実績" ? "bg-secondary text-foreground" : "bg-demo text-demo-foreground",
            )}
          >
            {tag}
          </span>
        )}
      </div>
      <div className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="text-muted-foreground mt-0.5 text-xs">{sub}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

export function KpiTiles() {
  const { snapshot } = useCompany();
  const k = snapshot.kpis;
  const p = snapshot.mission.progress;
  const demo = snapshot.mode === "demo";
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-7">
      <Tile icon={Target} tone="chad" label="MISSION進捗" value={`${p.percent}%`} sub={p.label} tag={demo ? "DEMO" : undefined} />
      <Tile
        icon={TrendingUp}
        label="今月の売上"
        value={formatJpy(k.revenueThisMonthJpy)}
        sub={`目標 ${formatJpy(snapshot.mission.monthlyRevenueTargetJpy)}`}
        tag="実績"
      />
      <Tile icon={Wallet} label="今月の利益" value={formatJpy(k.profitThisMonthJpy)} sub="売上 − 実費AIコスト" tag="実績" />
      <Tile
        icon={Cpu}
        label="AIコスト（今日）"
        value={formatJpyPrecise(k.aiCostTodayJpy)}
        sub={`今月 ${formatJpyPrecise(k.aiCostMonthJpy)} / 上限 ${formatJpy(k.monthlyBudgetJpy)}`}
        tag={k.aiCostEstimated ? "推定" : "実績"}
      />
      <Tile icon={Sparkles} tone="emerald" label="実行中Task" value={k.activeTasks} sub={`着手待ち ${k.queuedTasks}件`} tag={demo ? "DEMO" : undefined} />
      <Tile icon={ListChecks} label="完了Task" value={k.doneTasks} sub={`本日 ${k.doneToday}件`} tag={demo ? "DEMO" : undefined} />
      <Tile
        icon={ShieldCheck}
        tone={k.pendingApprovals ? "amber" : undefined}
        label="承認待ち"
        value={k.pendingApprovals}
        sub={k.pendingApprovals ? "CEOの判断が必要です" : "判断待ちなし"}
        href="/approvals"
      />
    </div>
  );
}

export function MissionCard() {
  const { snapshot } = useCompany();
  const m = snapshot.mission;
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <div className="text-chad text-xs font-bold tracking-[0.2em]">{m.code}</div>
          <CardTitle className="mt-1.5 text-base leading-snug">{m.title}</CardTitle>
        </div>
        {snapshot.mode === "demo" && <Badge variant="demo">DEMO</Badge>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">マイルストーン</span>
            <span className="font-semibold tabular-nums">{m.progress.percent}%</span>
          </div>
          <Progress value={m.progress.percent} />
        </div>
        <ol className="space-y-1.5">
          {m.progress.milestones.map((ms) => (
            <li key={ms.id} className="flex items-start gap-2 text-sm">
              {ms.done ? (
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="達成" />
              ) : (
                <CircleDashed className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-label="未達成" />
              )}
              <span className={cn(ms.done && "text-muted-foreground line-through decoration-1")}>{ms.label}</span>
            </li>
          ))}
        </ol>
        <div className="bg-secondary/60 rounded-lg p-3 text-sm">
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">今月の売上（実績）</span>
            <span className="font-bold tabular-nums">
              {formatJpy(m.revenueThisMonthJpy)} <span className="text-muted-foreground font-normal">/ {formatJpy(m.monthlyRevenueTargetJpy)}</span>
            </span>
          </div>
          <Progress value={(m.revenueThisMonthJpy / m.monthlyRevenueTargetJpy) * 100} className="mt-2" indicatorClassName="bg-emerald-600" />
          <p className="text-muted-foreground mt-2 text-xs">
            最初の1円：{m.firstYenAchieved ? "達成" : "未達成"}。{m.policy}
            {snapshot.mode === "demo" && " デモの成果は売上に含めません。"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function ChadMessageCard() {
  const { snapshot } = useCompany();
  const msg = snapshot.chadMessage;
  const runningCount = snapshot.commands.filter((c) => ["ANALYZING", "RUNNING", "REPORTING"].includes(c.status)).length;
  return (
    <Card className="border-chad/30 bg-[color-mix(in_oklch,var(--chad)_5%,var(--card))]">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="bg-chad text-chad-foreground grid size-8 place-items-center rounded-full">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <div>
            <CardTitle>CHADからの重要メッセージ</CardTitle>
            <CardDescription>
              {msg ? `${formatTime(msg.createdAt)} 更新` : "CEOの右腕・会社全体の司令塔"}
              {runningCount > 0 && ` ・ ${runningCount}件の指示を進行中`}
            </CardDescription>
          </div>
        </div>
        {msg?.mode === "demo" && <Badge variant="demo">DEMO</Badge>}
      </CardHeader>
      <CardContent>
        {msg ? (
          <div className="max-h-72 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</div>
        ) : (
          <div className="space-y-2 text-sm leading-relaxed">
            <p>CEO、A.I.T companyの準備は整っています。</p>
            <p>
              最優先は<strong>MISSION 001「知らない顧客から最初の1円を生み出す」</strong>。会議は増やさず、売上・利益・時間削減に直結する仕事だけを回します。
            </p>
            <p>上の入力欄から「チャド、MISSION 001を進めて」と指示してください。すぐに会社を動かします。</p>
          </div>
        )}
        <Link href="/chad" className="text-chad mt-3 inline-flex items-center gap-1 text-sm font-medium hover:underline">
          CHADとの会話を開く <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  );
}

export function Dashboard() {
  const { snapshot } = useCompany();
  const now = useNow(30_000);
  const today = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric", weekday: "short" }).format(now);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-muted-foreground text-sm">{today}</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {greeting(now)}、{snapshot.company.ceo.split(" ")[0]}CEO
          </h1>
        </div>
        <p className="text-muted-foreground text-sm">
          {snapshot.company.name} ・「{snapshot.company.philosophy}」
        </p>
      </div>

      <CommandBox />
      <KpiTiles />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <ChadMessageCard />
          <Card>
            <CardHeader className="flex-wrap">
              <div>
                <CardTitle>LIVE COMPANY MAP</CardTitle>
                <CardDescription>社員をクリックすると詳細を表示します。状態は実際の処理データから表示しています。</CardDescription>
              </div>
              <Link href="/organization" className="text-chad text-sm font-medium hover:underline">
                全体を見る
              </Link>
            </CardHeader>
            <CardContent className="space-y-4">
              <StatusLegend />
              <CompanyMap compact />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <MissionCard />
          <Card>
            <CardHeader>
              <div>
                <CardTitle>ACTIVITY STREAM</CardTitle>
                <CardDescription>会社の中で起きていること（実際の処理ログ）</CardDescription>
              </div>
              {snapshot.mode === "demo" && <Badge variant="demo">DEMO</Badge>}
            </CardHeader>
            <CardContent className="max-h-[36rem] overflow-y-auto">
              <ActivityStream limit={60} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
