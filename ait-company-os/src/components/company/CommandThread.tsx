"use client";

import { Check, LoaderCircle, Sparkles } from "lucide-react";
import { getMember } from "@/config/company";
import { Badge } from "@/components/ui/badge";
import { formatTime } from "@/lib/time";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PIPELINE_STAGES, type CommandView } from "@/lib/view";
import { TaskStatusChip } from "./DetailPanels";
import { useCompany } from "./StateProvider";

export function PipelineStepper({ command }: { command: CommandView }) {
  const answered = command.status === "ANSWERED";
  const stages = answered
    ? PIPELINE_STAGES.filter((s) => ["received", "analyzing", "done"].includes(s.id))
    : PIPELINE_STAGES;
  const current = stages.findIndex((s) => s.id === command.stage);
  const finished = command.stage === "done";

  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-[11px]" aria-label="処理の流れ">
      {stages.map((s, i) => {
        const done = finished || i < current;
        const active = !finished && i === current;
        return (
          <li key={s.id} className="flex items-center gap-1">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
                done && "bg-chad/15 text-chad",
                active && "bg-chad text-chad-foreground",
                !done && !active && "bg-secondary text-muted-foreground",
              )}
              aria-current={active ? "step" : undefined}
            >
              {done && <Check className="size-3" aria-hidden />}
              {active && <LoaderCircle className="size-3 animate-spin" aria-hidden />}
              {s.label}
            </span>
            {i < stages.length - 1 && <span aria-hidden className="text-muted-foreground">›</span>}
          </li>
        );
      })}
    </ol>
  );
}

function ChadBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="flex gap-3">
      <span className="bg-chad text-chad-foreground mt-1 grid size-8 shrink-0 place-items-center rounded-full">
        <Sparkles className="size-4" aria-hidden />
      </span>
      <div
        className={cn(
          "max-w-[46rem] min-w-0 flex-1 rounded-2xl rounded-tl-sm border px-4 py-3",
          message.kind === "report" && "border-chad/40 bg-[color-mix(in_oklch,var(--chad)_6%,var(--card))]",
          message.kind === "warning" && "border-red-300 bg-red-50 dark:bg-red-950",
          message.kind !== "report" && message.kind !== "warning" && "bg-card",
        )}
      >
        <div className="mb-1 flex items-center gap-2 text-xs">
          <span className="font-semibold">CHAD</span>
          {message.kind === "report" && <Badge variant="chad">報告</Badge>}
          {message.mode === "demo" && <Badge variant="demo">DEMO</Badge>}
          <time className="text-muted-foreground ml-auto" dateTime={message.createdAt}>
            {formatTime(message.createdAt)}
          </time>
        </div>
        <div className="text-sm leading-relaxed whitespace-pre-wrap">{message.text}</div>
      </div>
    </div>
  );
}

function CeoBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-end">
      <div className="bg-primary text-primary-foreground max-w-[36rem] rounded-2xl rounded-tr-sm px-4 py-2.5">
        <div className="mb-0.5 text-[11px] opacity-70">
          CEO ・ {formatTime(message.createdAt)}
        </div>
        <div className="text-sm whitespace-pre-wrap">{message.text}</div>
      </div>
    </div>
  );
}

function ProjectBlock({ command }: { command: CommandView }) {
  const { snapshot, openTask, openMember } = useCompany();
  const project = snapshot.projects.find((p) => p.id === command.projectId);
  const tasks = command.taskIds.map((id) => snapshot.tasks.find((t) => t.id === id)!).filter(Boolean);
  const a = command.analysis;
  const exec = project ? getMember(project.executiveId) : undefined;

  return (
    <div className="ml-11 space-y-3 rounded-xl border p-4">
      <PipelineStepper command={command} />
      {command.status === "ANALYZING" && (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> CHADが指示の意図・MISSION・KPIを確認して、優先順位を判断しています…
        </p>
      )}
      {a && (
        <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[7rem_1fr]">
          <dt className="text-muted-foreground">判断</dt>
          <dd>
            {a.intentLabel} <Badge variant="outline" className="ml-1">優先度：{a.priority}</Badge>
          </dd>
          <dt className="text-muted-foreground">MISSION確認</dt>
          <dd>{a.missionCheck}</dd>
          <dt className="text-muted-foreground">優先度の理由</dt>
          <dd>{a.priorityReason}</dd>
          {a.concern && (
            <>
              <dt className="text-muted-foreground">CHADの意見</dt>
              <dd className="text-amber-800 dark:text-amber-300">{a.concern}</dd>
            </>
          )}
        </dl>
      )}
      {project && (
        <div className="space-y-2 border-t pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Project</Badge>
            <span className="font-semibold">{project.title}</span>
          </div>
          <p className="text-muted-foreground text-sm">
            目的：{project.objective}
            {exec && (
              <>
                {" "}
                ・ 担当役員：
                <button type="button" className="hover:underline" onClick={() => openMember(exec.id)}>
                  {exec.name}
                </button>
              </>
            )}
          </p>
          <ul className="divide-y rounded-lg border">
            {tasks.map((t, i) => (
              <li key={t.id}>
                <button type="button" onClick={() => openTask(t.id)} className="hover:bg-accent flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
                  <span className="text-muted-foreground w-5 shrink-0 text-xs tabular-nums">{i + 1}.</span>
                  <TaskStatusChip status={t.status} />
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
                    {getMember(t.assigneeId)?.name} → {getMember(t.reviewerId)?.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** CEO指示ごとの会話・判断・Project・Task・報告をまとめて表示 */
export function CommandThread({ command }: { command: CommandView }) {
  const { snapshot } = useCompany();
  const messages = snapshot.messages.filter((m) => m.commandId === command.id);
  const ceo = messages.find((m) => m.role === "ceo");
  const chad = messages.filter((m) => m.role === "chad");
  const first = chad[0];
  const rest = chad.slice(1);

  return (
    <article className="space-y-3" aria-label={`指示：${command.text}`}>
      {ceo && <CeoBubble message={ceo} />}
      {first && <ChadBubble message={first} />}
      {(command.status !== "ANSWERED" || !first) && <ProjectBlock command={command} />}
      {rest.map((m) => (
        <ChadBubble key={m.id} message={m} />
      ))}
    </article>
  );
}

export { ChadBubble };
