"use client";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { STATUS_BAR } from "@/components/common/parts";
import { STATUS_LABEL } from "@/lib/domain/mandala";
import { LEVEL_LABEL, TASK_STATUS_LABEL } from "@/lib/domain/tasks";
import { addDays, addMonths, diffDays, monthOf, quarterOf, weekStart } from "@/lib/date";
import type { ActionStatus, Milestone, Task } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface GanttTask {
  id: string;
  title: string;
  start: string;
  end: string;
  status: Task["status"];
  level: Task["level"];
}
export interface GanttItem {
  id: string;
  code: string;
  title: string;
  start: string;
  end: string | null;
  progress: number;
  status: ActionStatus;
  tasks: GanttTask[];
}
export interface GanttGroup {
  code: string;
  title: string;
  progress: number;
  items: GanttItem[];
}
export type GanttMilestone = Milestone & { current: number | null; metricLabel: string };

const ZOOM = {
  year: { label: "年", px: 0.75 },
  quarter: { label: "四半期", px: 2 },
  month: { label: "月", px: 5 },
  week: { label: "週", px: 18 },
} as const;
type Zoom = keyof typeof ZOOM;

const ROW = 30;
const LABEL_W = 210;

type Row =
  | { kind: "group"; g: GanttGroup }
  | { kind: "item"; it: GanttItem }
  | { kind: "task"; t: GanttTask }
  | { kind: "milestones" };

export function Gantt({ start, end, today, groups, loose, milestones, deps }: { start: string; end: string; today: string; groups: GanttGroup[]; loose: GanttTask[]; milestones: GanttMilestone[]; deps: { from: string; to: string }[] }) {
  const [zoom, setZoom] = useState<Zoom>("quarter");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showTasks, setShowTasks] = useState(true);
  const px = ZOOM[zoom].px;
  const totalDays = Math.max(1, diffDays(end, start) + 1);
  const width = Math.round(totalDays * px);
  const x = (d: string) => Math.max(0, Math.min(width, diffDays(d, start) * px));

  const ticks = useMemo(() => {
    const out: { d: string; label: string; major: boolean }[] = [];
    if (zoom === "week") {
      for (let d = weekStart(start); d <= end; d = addDays(d, 7)) out.push({ d, label: `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`, major: d.slice(5, 7) !== addDays(d, -7).slice(5, 7) });
    } else if (zoom === "month") {
      for (let d = monthOf(start); d <= end; d = addMonths(d, 1)) out.push({ d, label: d.slice(5, 7) === "01" ? `${d.slice(0, 4)}/1` : `${Number(d.slice(5, 7))}月`, major: d.slice(5, 7) === "01" });
    } else if (zoom === "quarter") {
      for (let d = quarterOf(start).start; d <= end; d = addMonths(d, 3)) out.push({ d, label: `${d.slice(2, 4)}Q${quarterOf(d).q}`, major: quarterOf(d).q === 1 });
    } else {
      for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) out.push({ d: `${y}-01-01`, label: `${y}年`, major: true });
    }
    return out;
  }, [zoom, start, end]);

  const rows: Row[] = [{ kind: "milestones" }];
  for (const g of groups) {
    rows.push({ kind: "group", g });
    if (open.has(g.code)) {
      for (const it of g.items) {
        rows.push({ kind: "item", it });
        if (showTasks) for (const t of it.tasks) rows.push({ kind: "task", t });
      }
    }
  }
  if (loose.length && showTasks) {
    rows.push({ kind: "group", g: { code: "—", title: "マンダラに未紐づけのタスク", progress: 0, items: [] } });
    if (open.has("—")) for (const t of loose) rows.push({ kind: "task", t });
  }
  const rowIndex = new Map<string, number>();
  rows.forEach((r, i) => {
    if (r.kind === "task") rowIndex.set(r.t.id, i);
  });
  const taskById = new Map<string, GanttTask>();
  for (const g of groups) for (const it of g.items) for (const t of it.tasks) taskById.set(t.id, t);
  for (const t of loose) taskById.set(t.id, t);

  const toggle = (code: string) => {
    const n = new Set(open);
    if (n.has(code)) n.delete(code);
    else n.add(code);
    setOpen(n);
  };
  const height = rows.length * ROW;
  const todayX = today >= start && today <= end ? x(today) : null;

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-muted flex rounded-lg p-1" role="radiogroup" aria-label="表示単位">
            {(Object.keys(ZOOM) as Zoom[]).map((z) => (
              <button key={z} role="radio" aria-checked={zoom === z} onClick={() => setZoom(z)} className={cn("rounded-md px-3 py-1 text-sm", zoom === z && "bg-background shadow-sm")}>{ZOOM[z].label}</button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => setOpen(open.size ? new Set() : new Set([...groups.map((g) => g.code), "—"]))}>{open.size ? "すべて閉じる" : "すべて開く"}</Button>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={showTasks} onChange={(e) => setShowTasks(e.target.checked)} />タスクを表示</label>
          <div className="text-muted-foreground ml-auto flex flex-wrap gap-3 text-xs">
            {(["not_started", "in_progress", "achieved", "missed"] as ActionStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1"><i className={cn("inline-block h-2.5 w-4 rounded-sm", STATUS_BAR[s])} />{s === "missed" ? "遅延・未達" : STATUS_LABEL[s]}</span>
            ))}
            <span className="flex items-center gap-1"><i className="bg-primary inline-block size-2.5 rotate-45" />マイルストーン</span>
          </div>
        </div>

        <div className="relative overflow-x-auto rounded-lg border">
          <div className="relative" style={{ width: LABEL_W + width }}>
            {/* 目盛り */}
            <div className="bg-card sticky top-0 z-20 flex border-b" style={{ height: 30 }}>
              <div className="bg-card sticky left-0 z-30 shrink-0 border-r px-2 py-1.5 text-xs font-semibold" style={{ width: LABEL_W }}>項目</div>
              <div className="relative" style={{ width }}>
                {ticks.map((t) => (
                  <div key={t.d} className={cn("text-muted-foreground absolute top-0 h-full border-l pl-1 text-[10px] leading-[30px] whitespace-nowrap", t.major && "text-foreground font-semibold")} style={{ left: x(t.d) }}>{t.label}</div>
                ))}
              </div>
            </div>
            {/* 行 */}
            <div className="relative" style={{ height }}>
              {/* 縦の目盛り線と今日の線 */}
              <div className="pointer-events-none absolute inset-y-0" style={{ left: LABEL_W, width }}>
                {ticks.map((t) => <div key={t.d} className={cn("absolute inset-y-0 border-l", t.major ? "border-border" : "border-border/40")} style={{ left: x(t.d) }} />)}
                {todayX != null && <div className="absolute inset-y-0 z-10 border-l-2 border-status-red/70" style={{ left: todayX }} title={`今日 ${today}`} />}
              </div>
              {rows.map((r, i) => (
                <div key={i} className={cn("absolute flex w-full items-center border-b", r.kind === "group" && "bg-muted/40")} style={{ top: i * ROW, height: ROW }}>
                  <div className="bg-card sticky left-0 z-10 flex h-full shrink-0 items-center gap-1 border-r px-2 text-xs" style={{ width: LABEL_W }}>
                    {r.kind === "milestones" && <span className="font-semibold">マイルストーン</span>}
                    {r.kind === "group" && (
                      <button className="flex min-w-0 items-center gap-1 font-semibold" onClick={() => toggle(r.g.code)} aria-expanded={open.has(r.g.code)}>
                        {open.has(r.g.code) ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
                        <span className="truncate">{r.g.code !== "—" && `${r.g.code}. `}{r.g.title}</span>
                        {r.g.code !== "—" && <span className="num text-muted-foreground ml-1 shrink-0 font-normal">{r.g.progress}%</span>}
                      </button>
                    )}
                    {r.kind === "item" && <span className="truncate pl-4" title={r.it.title}><span className="text-muted-foreground">{r.it.code}</span> {r.it.title}</span>}
                    {r.kind === "task" && <span className="text-muted-foreground truncate pl-7" title={r.t.title}>{r.t.title}</span>}
                  </div>
                  <div className="relative h-full" style={{ width }}>
                    {r.kind === "milestones" &&
                      milestones.map((ms) => {
                        const late = ms.status !== "achieved" && ms.target_date < today;
                        return (
                          <div key={ms.id} className="absolute top-1/2 flex -translate-y-1/2 items-center gap-1" style={{ left: x(ms.target_date) - 6 }} title={`${ms.target_date} ${ms.title}`}>
                            <i className={cn("inline-block size-3 rotate-45", ms.status === "achieved" ? "bg-status-green" : late ? "bg-status-red" : "bg-primary")} />
                            {zoom !== "year" && <span className="text-[10px] whitespace-nowrap">{ms.title}</span>}
                          </div>
                        );
                      })}
                    {r.kind === "group" && r.g.items.length > 0 && <GroupBar g={r.g} x={x} />}
                    {r.kind === "item" && r.it.end && <Bar left={x(r.it.start)} right={x(r.it.end)} progress={r.it.progress} cls={STATUS_BAR[r.it.status]} title={`${r.it.code} ${r.it.title}：${STATUS_LABEL[r.it.status]}・${r.it.progress}%・期限 ${r.it.end}`} />}
                    {r.kind === "task" && (
                      <Bar
                        left={x(r.t.start)}
                        right={x(r.t.end) + px}
                        progress={r.t.status === "done" ? 100 : 0}
                        thin
                        cls={r.t.status === "done" ? STATUS_BAR.achieved : r.t.end < today ? STATUS_BAR.missed : r.t.status === "doing" ? STATUS_BAR.in_progress : STATUS_BAR.not_started}
                        title={`${LEVEL_LABEL[r.t.level]}：${r.t.title}（${TASK_STATUS_LABEL[r.t.status]}・${r.t.start}〜${r.t.end}）`}
                      />
                    )}
                  </div>
                </div>
              ))}
              {/* 依存関係の線（先行タスクの終わり → 後続タスクの始まり） */}
              <svg className="pointer-events-none absolute top-0" style={{ left: LABEL_W, width, height }} aria-hidden>
                {deps.map((d, k) => {
                  const fi = rowIndex.get(d.from);
                  const ti = rowIndex.get(d.to);
                  const ft = taskById.get(d.from);
                  const tt = taskById.get(d.to);
                  if (fi == null || ti == null || !ft || !tt) return null;
                  const x1 = x(ft.end) + px;
                  const y1 = fi * ROW + ROW / 2;
                  const x2 = x(tt.start);
                  const y2 = ti * ROW + ROW / 2;
                  const late = ft.status !== "done" && ft.end < today;
                  const mid = Math.max(x1 + 6, x2 - 6);
                  return <path key={k} d={`M${x1},${y1} H${mid} V${y2} H${x2}`} fill="none" stroke={late ? "var(--status-red)" : "var(--muted-foreground)"} strokeWidth={1.5} markerEnd="url(#arrow)" />;
                })}
                <defs>
                  <marker id="arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="var(--muted-foreground)" /></marker>
                </defs>
              </svg>
            </div>
          </div>
        </div>
        <p className="text-muted-foreground text-xs">領域名をタップすると、行動とタスクを展開します。バーの濃い部分が進捗、赤い縦線が今日です。矢印は依存関係（先に終わらせるタスク → 後のタスク）。</p>
      </CardContent>
    </Card>
  );
}

function Bar({ left, right, progress, cls, title, thin }: { left: number; right: number; progress: number; cls: string; title: string; thin?: boolean }) {
  const w = Math.max(4, right - left);
  return (
    <div className={cn("absolute top-1/2 -translate-y-1/2 overflow-hidden rounded", thin ? "h-2.5" : "h-4")} style={{ left, width: w }} title={title}>
      <div className={cn("absolute inset-0 opacity-30", cls)} />
      <div className={cn("absolute inset-y-0 left-0", cls)} style={{ width: `${progress}%` }} />
    </div>
  );
}

function GroupBar({ g, x }: { g: GanttGroup; x: (d: string) => number }) {
  const starts = g.items.map((i) => i.start);
  const ends = g.items.map((i) => i.end).filter(Boolean) as string[];
  if (!ends.length) return null;
  const l = x(starts.sort()[0]);
  const r = x(ends.sort()[ends.length - 1]);
  return <Bar left={l} right={r} progress={g.progress} cls={g.items.some((i) => i.status === "missed") ? STATUS_BAR.missed : STATUS_BAR.in_progress} title={`${g.code}. ${g.title}：進捗 ${g.progress}%`} />;
}
