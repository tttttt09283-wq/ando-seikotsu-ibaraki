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
} from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatJpy, formatJpyPrecise, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { COMMANDER_ID, getMember, OPERATOR_ID, PRESIDENT_ID, TENANT } from "@/tenant";
import { ActivityStream } from "./ActivityStream";
import { CommandBox } from "./CommandBox";
import { CompanyMap, StatusLegend } from "./CompanyMap";
import { CommanderIcon } from "./MemberParts";
import { formatOku, RevenueCard } from "./RevenuePanel";
import { useCompany, useNow } from "./StateProvider";

const COMMANDER = getMember(COMMANDER_ID)!;
const OPERATOR = getMember(OPERATOR_ID)!;
const PRESIDENT = getMember(PRESIDENT_ID)!;
const familyName = (n: string) => n.split(" ")[0];

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
  tone?: "brand" | "amber" | "emerald";
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
        <Icon className={cn("size-3.5", tone === "brand" && "text-brand", tone === "emerald" && "text-emerald-600")} />
        <span className="flex-1 truncate">{label}</span>
        {tag && (
          <span className={cn("rounded px-1 text-[10px] font-bold", tag === "実績" ? "bg-secondary text-foreground" : "bg-demo text-demo-foreground")}>
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
  const p = snapshot.mission;
  const r = snapshot.revenue;
  const demo = snapshot.mode === "demo";
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
      <Tile icon={Target} tone="brand" label="MISSION 001 進捗" value={`${p.percent}%`} sub={p.label} tag={demo ? "DEMO" : undefined} />
      <Tile
        icon={TrendingUp}
        label="年間売上の着地見込み"
        value={r.hasData ? formatOku(r.landingJpy) : "—"}
        sub={r.hasData ? `実績 ${formatOku(r.actualJpy)}・目標の${r.landingPercent}%` : "数字が未取り込みです"}
        tag="実績"
        href="/numbers"
      />
      <Tile
        icon={ShieldCheck}
        tone={k.pendingForOperator ? "amber" : undefined}
        label="承認待ち"
        value={k.pendingApprovals}
        sub={`${familyName(OPERATOR.name)} ${k.pendingForOperator}件 ・ 代表 ${k.pendingForPresident}件`}
        href="/approvals"
      />
      <Tile icon={Sparkles} tone="emerald" label="実行中Task" value={k.activeTasks} sub={`着手待ち ${k.queuedTasks}件`} tag={demo ? "DEMO" : undefined} />
      <Tile icon={ListChecks} label="完了Task" value={k.doneTasks} sub={`本日 ${k.doneToday}件`} tag={demo ? "DEMO" : undefined} />
      <Tile
        icon={Cpu}
        label="AIコスト（今日）"
        value={formatJpyPrecise(k.aiCostTodayJpy)}
        sub={`今月 ${formatJpyPrecise(k.aiCostMonthJpy)} / 上限 ${formatJpy(k.monthlyBudgetJpy)}`}
        tag={k.aiCostEstimated ? "推定" : "実績"}
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
          <div className="text-brand text-xs font-bold tracking-[0.2em]">{TENANT.mission.code}</div>
          <CardTitle className="mt-1.5 text-base leading-snug">{TENANT.mission.title}</CardTitle>
        </div>
        {snapshot.mode === "demo" && <Badge variant="demo">DEMO</Badge>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">マイルストーン</span>
            <span className="font-semibold tabular-nums">{m.percent}%</span>
          </div>
          <Progress value={m.percent} aria-label="MISSION 001の進捗" />
        </div>
        <ol className="space-y-1.5">
          {m.milestones.map((ms) => (
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
        <div className="bg-secondary/60 space-y-1.5 rounded-lg p-3 text-xs">
          <div className="font-semibold">評価軸</div>
          <div className="flex flex-wrap gap-1">
            {TENANT.evaluation.axes.map((a) => (
              <Badge key={a.id} variant="outline" className="font-normal">
                {a.label}
              </Badge>
            ))}
          </div>
          <p className="text-muted-foreground">{TENANT.mission.policy}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const ISSUE_STATUS_CLS = {
  未着手: "bg-secondary text-muted-foreground",
  対応中: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  成果物あり: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
} as const;

export function IssuesCard() {
  const { snapshot } = useCompany();
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>課題と優先順位</CardTitle>
          <CardDescription>優先度＝影響度×緊急度。対応状況は実際のTaskから判定</CardDescription>
        </div>
        {snapshot.mode === "demo" && <Badge variant="demo">対応状況はDEMO</Badge>}
      </CardHeader>
      <CardContent>
        <ol className="divide-y">
          {snapshot.issues.map((i, idx) => (
            <li key={i.id} className="flex items-start gap-2 py-2 text-sm">
              <span className="text-muted-foreground w-4 shrink-0 pt-0.5 text-xs tabular-nums">{idx + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="leading-snug">{i.title}</div>
                <div className="text-muted-foreground text-xs">
                  影響 {i.impact} × 緊急 {i.urgency} ＝ {i.score}
                </div>
              </div>
              <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold", ISSUE_STATUS_CLS[i.status])}>{i.status}</span>
            </li>
          ))}
        </ol>
        <p className="text-muted-foreground mt-2 text-xs">新しい課題は「課題を洗い出して優先順位をつけて」と指示すると、司令塔が業務から探して提案します。</p>
      </CardContent>
    </Card>
  );
}

export function CommanderMessageCard() {
  const { snapshot } = useCompany();
  const msg = snapshot.commanderMessage;
  const runningCount = snapshot.commands.filter((c) => ["ANALYZING", "RUNNING", "REPORTING"].includes(c.status)).length;
  return (
    <Card className="border-brand/30 bg-[color-mix(in_oklch,var(--brand)_5%,var(--card))]">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CommanderIcon />
          <div>
            <CardTitle>司令塔 {COMMANDER.name}からのメッセージ</CardTitle>
            <CardDescription>
              {msg ? `${formatTime(msg.createdAt)} 更新` : COMMANDER.title}
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
            <p>{familyName(OPERATOR.name)}さん、司令塔の{COMMANDER.name}です。AI部門の準備は整っています。</p>
            <p>
              最優先は<strong>{TENANT.mission.code}「{TENANT.mission.title}」</strong>。並行して、{TENANT.revenueTarget.label}
              の進捗を追えるように、お金と数字の見える化も進めます。
            </p>
            <p>上の入力欄から「MISSION 001を進めて」と指示してください。すぐにチームを動かします。</p>
          </div>
        )}
        <Link href="/commander" className="text-brand mt-3 inline-flex items-center gap-1 text-sm font-medium hover:underline">
          司令塔との会話を開く <ArrowRight className="size-3.5" aria-hidden />
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
            {greeting(now)}、{familyName(OPERATOR.name)}さん
          </h1>
        </div>
        <p className="text-muted-foreground text-sm">
          {TENANT.company.name} {TENANT.division.name} ・ 代表 {PRESIDENT.name} ・「{TENANT.company.philosophy}」
        </p>
      </div>

      <CommandBox />
      <KpiTiles />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <CommanderMessageCard />
          <RevenueCard />
          <Card>
            <CardHeader className="flex-wrap">
              <div>
                <CardTitle>組織図と稼働状況</CardTitle>
                <CardDescription>メンバーを押すと詳細を表示します。状態は実際の処理データから表示しています。</CardDescription>
              </div>
              <Link href="/organization" className="text-brand text-sm font-medium hover:underline">
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
          <IssuesCard />
          <Card>
            <CardHeader>
              <div>
                <CardTitle>活動ログ</CardTitle>
                <CardDescription>AI部門の中で起きていること（実際の処理ログ）</CardDescription>
              </div>
              {snapshot.mode === "demo" && <Badge variant="demo">DEMO</Badge>}
            </CardHeader>
            <CardContent className="max-h-[36rem] overflow-y-auto">
              <ActivityStream limit={40} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
