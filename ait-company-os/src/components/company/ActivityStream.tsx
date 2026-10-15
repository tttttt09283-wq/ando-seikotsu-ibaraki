"use client";

import { getMember } from "@/config/company";
import { formatTime } from "@/lib/time";
import type { Activity } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCompany } from "./StateProvider";

const TYPE_COLOR: Record<Activity["type"], string> = {
  command: "bg-primary",
  analysis: "bg-chad",
  plan: "bg-chad",
  assign: "bg-chad",
  start: "bg-violet-500",
  work: "bg-emerald-500",
  deliver: "bg-emerald-600",
  review: "bg-sky-500",
  revision: "bg-orange-500",
  approval: "bg-amber-500",
  report: "bg-chad",
  safety: "bg-red-600",
  error: "bg-red-500",
  system: "bg-slate-400",
};

/** 行頭の「◯◯が」は名前と重複するので省く */
function stripActor(message: string, names: (string | undefined)[]): string {
  for (const n of names) {
    if (n && message.startsWith(`${n}が`)) return message.slice(n.length + 1);
  }
  return message;
}

/** ACTIVITY STREAM：実際の処理ログを新しい順に表示 */
export function ActivityStream({
  limit = 40,
  filter,
  className,
}: {
  limit?: number;
  filter?: (a: Activity) => boolean;
  className?: string;
}) {
  const { snapshot, openTask, openMember } = useCompany();
  const items = [...snapshot.activities].filter(filter ?? (() => true)).reverse().slice(0, limit);

  if (items.length === 0) {
    return <p className="text-muted-foreground py-6 text-center text-sm">まだ活動記録はありません。CHADに指示を出すと、ここに会社の動きが流れます。</p>;
  }

  return (
    <ol className={cn("relative space-y-0", className)} aria-live="polite">
      {items.map((a, i) => {
        const actor = getMember(a.actorId);
        return (
          <li key={a.id} className="relative flex gap-3 pb-3">
            {i < items.length - 1 && <span aria-hidden className="bg-border absolute top-3 left-[3.6rem] h-full w-px" />}
            <time className="text-muted-foreground w-12 shrink-0 pt-0.5 text-right font-mono text-[11px] tabular-nums" dateTime={a.at}>
              {formatTime(a.at).slice(0, 5)}
            </time>
            <span aria-hidden className={cn("relative z-10 mt-1.5 size-2 shrink-0 rounded-full", TYPE_COLOR[a.type])} />
            <div className="min-w-0 flex-1 text-sm leading-snug">
              <button
                type="button"
                className="mr-1 font-semibold hover:underline"
                onClick={() => actor && openMember(actor.id)}
              >
                {actor?.name ?? a.actorId}
              </button>
              <span className="text-foreground/90">{stripActor(a.message, [actor?.name, a.actorId === "ceo" ? "CEO" : undefined])}</span>
              {a.taskId && (
                <button type="button" className="text-chad ml-1 text-xs hover:underline" onClick={() => openTask(a.taskId!)}>
                  詳細
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
