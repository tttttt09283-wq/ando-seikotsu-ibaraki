import type { AgentStatus, TaskStatus } from "@/lib/types";

export const AGENT_STATUS_META: Record<AgentStatus | "HUMAN", { label: string; dot: string; chip: string; live: boolean }> = {
  IDLE: { label: "IDLE", dot: "bg-slate-400", chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", live: false },
  THINKING: { label: "THINKING", dot: "bg-violet-500 text-violet-500", chip: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200", live: true },
  WORKING: { label: "WORKING", dot: "bg-emerald-500 text-emerald-500", chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200", live: true },
  REVIEWING: { label: "REVIEWING", dot: "bg-sky-500 text-sky-500", chip: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200", live: true },
  WAITING_APPROVAL: { label: "WAITING_APPROVAL", dot: "bg-amber-500", chip: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200", live: false },
  STANDBY: { label: "STANDBY", dot: "bg-transparent border border-dashed border-slate-400", chip: "bg-transparent border border-dashed text-muted-foreground", live: false },
  ERROR: { label: "ERROR", dot: "bg-red-500", chip: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200", live: false },
  HUMAN: { label: "CEO", dot: "bg-primary", chip: "bg-primary text-primary-foreground", live: false },
};

export const AGENT_STATUS_JA: Record<AgentStatus, string> = {
  IDLE: "待機（指示待ち）",
  THINKING: "思考中",
  WORKING: "作業中",
  REVIEWING: "レビュー中",
  WAITING_APPROVAL: "承認待ち",
  STANDBY: "待機（未稼働）",
  ERROR: "エラー",
};

export const TASK_STATUS_META: Record<TaskStatus, { label: string; chip: string }> = {
  QUEUED: { label: "着手待ち", chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  THINKING: { label: "検討中", chip: AGENT_STATUS_META.THINKING.chip },
  WORKING: { label: "作業中", chip: AGENT_STATUS_META.WORKING.chip },
  IN_REVIEW: { label: "レビュー中", chip: AGENT_STATUS_META.REVIEWING.chip },
  REVISION: { label: "修正中", chip: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200" },
  WAITING_APPROVAL: { label: "CEO承認待ち", chip: AGENT_STATUS_META.WAITING_APPROVAL.chip },
  DONE: { label: "完了", chip: "bg-emerald-600 text-white" },
  FAILED: { label: "失敗", chip: AGENT_STATUS_META.ERROR.chip },
  CANCELLED: { label: "中止", chip: "bg-transparent border text-muted-foreground" },
};
