"use client";

import { Check, LoaderCircle } from "lucide-react";
import { COMMANDER_ID, getMember, OPERATOR_ID, TENANT } from "@/tenant";
import { Badge } from "@/components/ui/badge";
import { formatTime } from "@/lib/time";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PIPELINE_STAGES, type CommandView } from "@/lib/view";
import { TaskStatusChip } from "./DetailPanels";
import { CommanderIcon } from "./MemberParts";
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
                done && "bg-brand/15 text-brand",
                active && "bg-brand text-brand-foreground",
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

function CommanderBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="flex gap-3">
      <CommanderIcon className="mt-1" />
      <div
        className={cn(
          "max-w-[46rem] min-w-0 flex-1 rounded-2xl rounded-tl-sm border px-4 py-3",
          message.kind === "report" && "border-brand/40 bg-[color-mix(in_oklch,var(--brand)_6%,var(--card))]",
          message.kind === "warning" && "border-red-300 bg-red-50 dark:bg-red-950",
          message.kind !== "report" && message.kind !== "warning" && "bg-card",
        )}
      >
        <div className="mb-1 flex items-center gap-2 text-xs">
          <span className="font-semibold">{getMember(COMMANDER_ID)?.name}（司令塔）</span>
          {message.kind === "report" && <Badge variant="brand">報告</Badge>}
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

function OperatorBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-end">
      <div className="bg-primary text-primary-foreground max-w-[36rem] rounded-2xl rounded-tr-sm px-4 py-2.5">
        <div className="mb-0.5 text-[11px] opacity-70">
          {getMember(OPERATOR_ID)?.name} ・ {formatTime(message.createdAt)}
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
  const lead = project ? getMember(project.leadId) : undefined;
  const issues = project ? TENANT.issues.filter((i) => project.issueIds.includes(i.id)) : [];

  return (
    <div className="ml-11 space-y-3 rounded-xl border p-4">
      <PipelineStepper command={command} />
      {command.status === "ANALYZING" && (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> 司令塔が指示の意図・MISSION・売上目標を確認して、優先順位を判断しています…
        </p>
      )}
      {a && (
        <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[7rem_1fr]">
          <dt className="text-muted-foreground">判断</dt>
          <dd>
            {a.intentLabel} <Badge variant="outline" className="ml-1">優先度：{a.priority}</Badge>
          </dd>
          <dt className="text-muted-foreground">目標の確認</dt>
          <dd>{a.missionCheck}</dd>
          <dt className="text-muted-foreground">優先度の理由</dt>
          <dd>{a.priorityReason}</dd>
          {a.concern && (
            <>
              <dt className="text-muted-foreground">司令塔の意見</dt>
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
            {lead && (
              <>
                {" "}
                ・ 担当リーダー：
                <button type="button" className="hover:underline" onClick={() => openMember(lead.id)}>
                  {lead.name}
                </button>
              </>
            )}
            {issues.length > 0 && <> ・ 取り組む課題：{issues.map((i) => i.title).join("／")}</>}
          </p>
          <ul className="divide-y rounded-lg border">
            {tasks.map((t, i) => (
              <li key={t.id}>
                <button type="button" onClick={() => openTask(t.id)} className="hover:bg-accent flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
                  <span className="text-muted-foreground w-5 shrink-0 text-xs tabular-nums">{i + 1}.</span>
                  <TaskStatusChip status={t.status} />
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  {t.confidential && <Badge variant="outline" className="shrink-0 text-[10px]">機密</Badge>}
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

/** 指示ごとの会話・判断・Project・Task・報告をまとめて表示 */
export function CommandThread({ command }: { command: CommandView }) {
  const { snapshot } = useCompany();
  const messages = snapshot.messages.filter((m) => m.commandId === command.id);
  const operator = messages.find((m) => m.role === "operator");
  const replies = messages.filter((m) => m.role === "commander");
  const first = replies[0];
  const rest = replies.slice(1);

  return (
    <article className="space-y-3" aria-label={`指示：${command.text}`}>
      {operator && <OperatorBubble message={operator} />}
      {first && <CommanderBubble message={first} />}
      {(command.status !== "ANSWERED" || !first) && <ProjectBlock command={command} />}
      {rest.map((m) => (
        <CommanderBubble key={m.id} message={m} />
      ))}
    </article>
  );
}

export { CommanderBubble };
