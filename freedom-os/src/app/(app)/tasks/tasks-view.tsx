"use client";
import { useMemo, useState } from "react";
import { Plus, TriangleExclamationPoint, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Empty } from "@/components/common/parts";
import { TaskCheck } from "@/components/common/task-check";
import { LEVEL_LABEL, PRIORITY_LABEL, TASK_STATUS_LABEL, type WeekStats } from "@/lib/domain/tasks";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TaskDialog } from "./task-dialog";

export interface TaskRow extends Task {
  code: string;
  dependsOn: string[];
}

const FILTERS = [
  { v: "open", label: "未完了" },
  { v: "week", label: "今週" },
  { v: "overdue", label: "遅延" },
  { v: "done", label: "完了（実績）" },
  { v: "all", label: "すべて" },
] as const;

export function TasksView({
  tasks,
  today,
  todayIds,
  reasons,
  week,
  actionOptions,
  initialAction,
  openNew,
}: {
  tasks: TaskRow[];
  today: string;
  todayIds: string[];
  reasons: Record<string, string[]>;
  week: WeekStats;
  actionOptions: { id: string; label: string }[];
  initialAction: string;
  openNew: boolean;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["v"]>(initialAction ? "all" : "open");
  const [level, setLevel] = useState("");
  const [actionId, setActionId] = useState(initialAction);
  const [editing, setEditing] = useState<TaskRow | "new" | null>(openNew ? "new" : null);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const list = useMemo(() => {
    return tasks
      .filter((t) => {
        if (actionId && t.mandala_action_id !== actionId) return false;
        if (level && t.level !== level) return false;
        if (filter === "open") return t.status !== "done";
        if (filter === "done") return t.status === "done";
        if (filter === "overdue") return t.status !== "done" && !!t.due_date && t.due_date < today;
        if (filter === "week") return !!t.due_date && t.due_date >= week.weekStart && t.due_date <= week.weekEnd;
        return true;
      })
      .sort((a, b) =>
        filter === "done"
          ? (b.completed_at ?? "").localeCompare(a.completed_at ?? "")
          : (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || a.priority - b.priority,
      );
  }, [tasks, filter, level, actionId, today, week]);

  const todays = todayIds.map((id) => byId.get(id)).filter(Boolean) as TaskRow[];
  const doneMinutes = tasks.filter((t) => t.status === "done" && t.completed_at === today).reduce((s, t) => s + (t.actual_minutes ?? t.estimate_minutes), 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">今日の最重要1＋補助2</h2>
              <span className="text-muted-foreground text-xs">今日完了：{doneMinutes}分</span>
            </div>
            {todays.length === 0 ? (
              <p className="text-muted-foreground text-sm">提案できるタスクがありません（未完了・開始済み・依存先完了のタスクから選びます）。</p>
            ) : (
              todays.map((t, i) => (
                <div key={t.id} className={cn("flex items-start gap-3 rounded-lg border p-3", i === 0 && "border-primary/60 bg-primary/5")}>
                  <TaskCheck id={t.id} done={t.status === "done"} label={t.title} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(t)}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {i === 0 ? <Badge>最重要</Badge> : <Badge variant="secondary">補助</Badge>}
                      {t.code && <Badge variant="outline">{t.code}</Badge>}
                      <span className="text-muted-foreground text-xs">{t.estimate_minutes}分</span>
                    </div>
                    <div className="mt-1 font-medium">{t.title}</div>
                    <div className="text-muted-foreground text-xs">{reasons[t.id]?.join(" ／ ")}</div>
                  </button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3">
            <h2 className="font-semibold">今週の達成率</h2>
            <div className="num text-3xl font-bold">{week.rate == null ? "—" : `${Math.round(week.rate * 100)}%`}</div>
            <Progress value={(week.rate ?? 0) * 100} />
            <p className="text-muted-foreground text-xs">{week.weekStart} 〜 {week.weekEnd} が期限のタスク {week.done}/{week.total} 件完了</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="bg-muted flex overflow-x-auto rounded-lg p-1">
          {FILTERS.map((f) => (
            <button key={f.v} onClick={() => setFilter(f.v)} className={cn("rounded-md px-3 py-1.5 text-sm whitespace-nowrap", filter === f.v && "bg-background shadow-sm")}>{f.label}</button>
          ))}
        </div>
        <NativeSelect value={level} onChange={(e) => setLevel(e.target.value)} className="w-auto" aria-label="階層で絞り込み">
          <option value="">すべての階層</option>
          {Object.entries(LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
        <NativeSelect value={actionId} onChange={(e) => setActionId(e.target.value)} className="w-auto max-w-64" aria-label="マンダラ項目で絞り込み">
          <option value="">すべてのマンダラ項目</option>
          {actionOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </NativeSelect>
        <Button className="ml-auto" onClick={() => setEditing("new")}><Plus />タスク追加</Button>
      </div>

      {list.length === 0 ? (
        <Empty>該当するタスクはありません。</Empty>
      ) : (
        <ul className="space-y-2">
          {list.map((t) => {
            const overdue = t.status !== "done" && t.due_date && t.due_date < today;
            const parent = t.parent_id ? byId.get(t.parent_id) : null;
            const waiting = t.dependsOn.filter((d) => byId.get(d)?.status !== "done");
            return (
              <li key={t.id} className={cn("bg-card flex items-start gap-3 rounded-xl border p-3", overdue && "border-status-red/50")}>
                <TaskCheck id={t.id} done={t.status === "done"} label={t.title} />
                <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(t)}>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge variant="secondary">{LEVEL_LABEL[t.level]}</Badge>
                    {t.code && <Badge variant="outline">{t.code}</Badge>}
                    <Badge variant={t.status === "done" ? "green" : t.status === "doing" ? "blue" : t.status === "blocked" ? "amber" : "gray"}>{TASK_STATUS_LABEL[t.status]}</Badge>
                    <span className="text-muted-foreground">優先 {PRIORITY_LABEL[t.priority]}・{t.estimate_minutes}分</span>
                    {overdue && <span className="text-status-red flex items-center gap-0.5 font-semibold"><TriangleExclamationPoint className="size-3" />遅延</span>}
                    {t.source === "ai" && <Badge variant="blue">AI提案</Badge>}
                  </div>
                  <div className={cn("mt-1 font-medium", t.status === "done" && "text-muted-foreground line-through")}>{t.title}</div>
                  <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 text-xs">
                    {t.due_date && <span>期限 {t.due_date}</span>}
                    {t.completed_at && <span>完了 {t.completed_at}</span>}
                    {parent && <span className="truncate">↑ {parent.title}</span>}
                    {waiting.length > 0 && <span className="text-status-amber flex items-center gap-0.5"><Link2 className="size-3" />先行タスク待ち {waiting.length}件</span>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <TaskDialog
          key={editing === "new" ? "new" : editing.id}
          task={editing === "new" ? null : editing}
          tasks={tasks}
          actionOptions={actionOptions}
          defaultActionId={actionId}
          today={today}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
