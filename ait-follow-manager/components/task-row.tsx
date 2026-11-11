import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DueBadge, PriorityMark, TaskStatusBadge, type TaskStatus } from "@/components/status";
import { cn } from "@/lib/utils";
import { daysBetween } from "@/lib/dates";

export type TaskListItem = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: "high" | "normal" | "low";
  due_on: string;
  task_kind: "contact" | "internal";
  customer: { family_name: string; given_name: string; customer_code: string } | null;
  assignee: { display_name: string } | null;
  store: { name: string } | null;
};

export const TASK_SELECT =
  "id, title, status, priority, due_on, task_kind, customer:customers(family_name, given_name, customer_code), assignee:users!followup_tasks_assigned_to_fkey(display_name), store:stores(name)";

export function TaskRow({ task, today, orgSlug, showStore }: { task: TaskListItem; today: string; orgSlug: string; showStore?: boolean }) {
  const overdue = task.status === "open" && daysBetween(today, task.due_on) < 0;
  const isToday = task.status === "open" && task.due_on === today;
  return (
    <li>
      <Link
        href={`/o/${orgSlug}/tasks/${task.id}`}
        className={cn(
          "flex items-center gap-3 rounded-lg border border-l-4 bg-card p-3 hover:bg-muted/50",
          overdue ? "border-l-danger" : isToday ? "border-l-primary" : "border-l-transparent",
          task.status === "on_hold" && "opacity-75",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <PriorityMark priority={task.priority} />
            <span className="truncate font-bold">
              {task.customer ? `${task.customer.family_name} ${task.customer.given_name}` : "（顧客不明）"}
            </span>
            {task.status === "open" ? <DueBadge dueOn={task.due_on} today={today} status={task.status} /> : <TaskStatusBadge status={task.status} />}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 text-sm text-muted-foreground">
            <span>{task.title}</span>
            {task.task_kind === "internal" && <Badge variant="muted">社内作業</Badge>}
            <span>担当：{task.assignee?.display_name ?? "未割当"}</span>
            {showStore && task.store && <span>{task.store.name}</span>}
          </div>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}
