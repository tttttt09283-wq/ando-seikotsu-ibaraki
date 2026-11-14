"use client";
import { useEffect, useMemo, useState } from "react";
import { Download, LayoutGrid, Grid3x3, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { STATUS_BAR, STATUS_CELL } from "@/components/common/parts";
import { STATUS_LABEL, type ActionEvaluation } from "@/lib/domain/mandala";
import type { ActionLinkage } from "@/lib/domain/model";
import { BLOCK_TO_AREA, CELL_TO_POS } from "@/lib/io/mandala-io";
import type { ActionStatus, AreaCode, MandalaAction, Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ActionDialog } from "./action-dialog";
import { GoalDialog } from "./goal-dialog";
import { ImportDialog } from "./import-dialog";

export interface BoardGoal {
  id: string;
  code: AreaCode;
  title: string;
  description: string;
  progress: number;
  counts: Record<ActionStatus, number>;
}
export interface BoardAction extends MandalaAction {
  code: string;
  areaCode: string;
  eval: ActionEvaluation;
  linkage: ActionLinkage;
  tasks: Pick<Task, "id" | "title" | "status" | "due_date" | "level">[];
}

type Center = { id: string; title: string; description: string } | null;

export function MandalaBoard({ center, goals, actions, overall, today }: { center: Center; goals: BoardGoal[]; actions: BoardAction[]; overall: number; today: string }) {
  const [view, setView] = useState<"grid" | "area">("grid");
  const [area, setArea] = useState<AreaCode | null>(null);
  const [openAction, setOpenAction] = useState<string | null>(null);
  const [openGoal, setOpenGoal] = useState<string | "CENTER" | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  // スマホ幅では81マスが小さすぎるため、最初は「領域ごと」で表示する
  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setView("area");
  }, []);

  const goalByCode = useMemo(() => new Map(goals.map((g) => [g.code, g])), [goals]);
  const actionAt = (code: string, pos: number) => actions.find((a) => a.areaCode === code && a.position === pos);
  const current = openAction ? actions.find((a) => a.id === openAction) ?? null : null;
  const editingGoal = openGoal === "CENTER" ? (center ? { ...center, code: "CENTER" as const } : null) : openGoal ? (() => { const g = goals.find((x) => x.id === openGoal); return g ? { id: g.id, title: g.title, description: g.description, code: g.code } : null; })() : null;

  const counts = actions.reduce((acc, a) => ((acc[a.eval.status] = (acc[a.eval.status] ?? 0) + 1), acc), {} as Record<string, number>);

  return (
    <div className="space-y-4">
      {/* ツールバー */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="bg-muted inline-flex rounded-lg p-1" role="tablist" aria-label="表示切替">
          <button role="tab" aria-selected={view === "grid"} onClick={() => setView("grid")} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm", view === "grid" && "bg-background shadow-sm")}>
            <Grid3x3 className="size-4" />81マス
          </button>
          <button role="tab" aria-selected={view === "area"} onClick={() => setView("area")} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm", view === "area" && "bg-background shadow-sm")}>
            <LayoutGrid className="size-4" />領域ごと
          </button>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Upload />取り込み</Button>
          <Button variant="outline" size="sm" asChild><a href="/api/export?type=mandala-list"><Download />一覧CSV</a></Button>
          <Button variant="outline" size="sm" asChild><a href="/api/export?type=mandala-grid"><Download />9×9 CSV</a></Button>
        </div>
      </div>

      {/* 凡例（色＋文字） */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="text-muted-foreground">全体の進捗 <b className="num text-foreground">{overall}%</b></span>
        {(["not_started", "in_progress", "achieved", "missed"] as ActionStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <i className={cn("inline-block size-3 rounded-sm", STATUS_BAR[s])} />
            {STATUS_LABEL[s]} <span className="num text-muted-foreground">{counts[s] ?? 0}</span>
          </span>
        ))}
      </div>

      {view === "grid" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          <div className="grid min-w-[760px] grid-cols-3 gap-2 sm:gap-3">
            {BLOCK_TO_AREA.map((blockArea, b) => (
              <div key={b} className="grid grid-cols-3 gap-1">
                {CELL_TO_POS.map((pos, k) => {
                  if (blockArea === "CENTER") {
                    if (pos === 0) return <CenterCell key={k} title={center?.title ?? ""} progress={overall} onClick={() => setOpenGoal("CENTER")} />;
                    const g = goalByCode.get(BLOCK_TO_AREA[k] as AreaCode);
                    return g ? <GoalCell key={k} g={g} compact onClick={() => setOpenGoal(g.id)} /> : <div key={k} />;
                  }
                  const g = goalByCode.get(blockArea);
                  if (pos === 0) return g ? <GoalCell key={k} g={g} compact onClick={() => setOpenGoal(g.id)} /> : <div key={k} />;
                  const a = actionAt(blockArea, pos);
                  return <ActionCell key={k} a={a} compact onClick={() => a && setOpenAction(a.id)} />;
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <AreaView
          area={area}
          setArea={setArea}
          center={center}
          goals={goals}
          overall={overall}
          actionAt={actionAt}
          onAction={(id) => setOpenAction(id)}
          onGoal={(id) => setOpenGoal(id)}
        />
      )}

      {current && <ActionDialog key={current.id} action={current} today={today} open onOpenChange={(o) => !o && setOpenAction(null)} />}
      {editingGoal && <GoalDialog key={editingGoal.id} goal={editingGoal} open onOpenChange={(o) => !o && setOpenGoal(null)} />}
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} goals={goals} center={center} actions={actions} />
    </div>
  );
}

function AreaView({
  area,
  setArea,
  center,
  goals,
  overall,
  actionAt,
  onAction,
  onGoal,
}: {
  area: AreaCode | null;
  setArea: (a: AreaCode | null) => void;
  center: Center;
  goals: BoardGoal[];
  overall: number;
  actionAt: (code: string, pos: number) => BoardAction | undefined;
  onAction: (id: string) => void;
  onGoal: (id: string | "CENTER") => void;
}) {
  if (!area) {
    // 中心ブロック：中心目標 + 8領域
    return (
      <div className="grid grid-cols-3 gap-2">
        {CELL_TO_POS.map((pos, k) => {
          if (pos === 0) return <CenterCell key={k} title={center?.title ?? ""} progress={overall} onClick={() => onGoal("CENTER")} />;
          const g = goals.find((x) => x.code === BLOCK_TO_AREA[k]);
          return g ? <GoalCell key={k} g={g} onClick={() => setArea(g.code)} hint="タップで8行動を表示" /> : <div key={k} />;
        })}
      </div>
    );
  }
  const g = goals.find((x) => x.code === area)!;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => setArea(null)}>← 全領域へ戻る</Button>
        <div className="flex flex-wrap gap-1">
          {goals.map((x) => (
            <button key={x.code} onClick={() => setArea(x.code)} className={cn("size-8 rounded-md border text-xs font-semibold", x.code === area && "border-primary text-primary")}>{x.code}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {CELL_TO_POS.map((pos, k) => {
          if (pos === 0) return <GoalCell key={k} g={g} onClick={() => onGoal(g.id)} hint="タップで領域名を編集" />;
          const a = actionAt(area, pos);
          return <ActionCell key={k} a={a} onClick={() => a && onAction(a.id)} />;
        })}
      </div>
    </div>
  );
}

function CenterCell({ title, progress, onClick }: { title: string; progress: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="bg-sidebar flex aspect-square flex-col justify-between rounded-lg p-2 text-left text-white ring-2 ring-primary/60">
      <span className="line-clamp-6 text-[11px] leading-snug font-semibold sm:text-xs">{title || "中心目標を設定"}</span>
      <span className="num text-primary text-xs font-bold">全体 {progress}%</span>
    </button>
  );
}

function GoalCell({ g, onClick, compact, hint }: { g: BoardGoal; onClick: () => void; compact?: boolean; hint?: string }) {
  return (
    <button onClick={onClick} className="bg-secondary flex aspect-square flex-col justify-between rounded-lg border-2 border-primary/40 p-2 text-left">
      <span>
        <span className="text-primary text-[11px] font-bold">{g.code}</span>
        <span className={cn("ml-1 font-semibold leading-snug", compact ? "line-clamp-3 text-[11px]" : "line-clamp-3 text-sm")}>{g.title || "（未設定）"}</span>
      </span>
      <span className="space-y-1">
        {!compact && hint && <span className="text-muted-foreground block text-[10px]">{hint}</span>}
        <span className="num text-muted-foreground block text-[10px]">進捗 {g.progress}%{g.counts.missed ? `・未達${g.counts.missed}` : ""}</span>
        <Progress value={g.progress} className="h-1" />
      </span>
    </button>
  );
}

function ActionCell({ a, onClick, compact }: { a: BoardAction | undefined; onClick: () => void; compact?: boolean }) {
  if (!a) return <div className="bg-muted/30 aspect-square rounded-lg border border-dashed" aria-hidden />;
  const st = a.eval.status;
  return (
    <button
      onClick={onClick}
      className={cn("group flex aspect-square flex-col justify-between rounded-lg border-2 p-1.5 text-left transition hover:brightness-110 sm:p-2", STATUS_CELL[st])}
      aria-label={`${a.code} ${a.title}（${STATUS_LABEL[st]}・進捗${a.eval.progress}%）`}
    >
      <span className={cn("leading-snug", compact ? "line-clamp-3 text-[10.5px]" : "line-clamp-4 text-[13px] font-medium")}>
        <span className="text-muted-foreground mr-0.5 text-[9px]">{a.code}</span>
        {a.title || "（未設定）"}
      </span>
      <span className="space-y-0.5">
        <span className="flex items-center justify-between gap-1 text-[9.5px] sm:text-[10px]">
          <span className="font-semibold">{STATUS_LABEL[st]}</span>
          <span className="num">{a.eval.progress}%</span>
        </span>
        <span className="bg-background/60 block h-1 overflow-hidden rounded-full">
          <span className={cn("block h-full", STATUS_BAR[st])} style={{ width: `${a.eval.progress}%` }} />
        </span>
      </span>
    </button>
  );
}
