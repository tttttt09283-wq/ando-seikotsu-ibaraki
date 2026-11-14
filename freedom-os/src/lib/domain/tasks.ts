// タスクの優先度計算と「今日の最重要1＋補助2」の提案
import { addDays, diffDays, weekStart } from "../date";
import type { Task, TaskDependency } from "../types";
import type { ActionEvaluation } from "./mandala";

export const LEVEL_LABEL: Record<Task["level"], string> = {
  long: "長期目標",
  year: "年間目標",
  quarter: "四半期目標",
  month: "月間目標",
  week: "週間タスク",
  day: "今日の行動",
};
export const TASK_STATUS_LABEL: Record<Task["status"], string> = { todo: "未着手", doing: "進行中", done: "完了", blocked: "保留" };
export const PRIORITY_LABEL: Record<number, string> = { 1: "高", 2: "中", 3: "低" };

/** 実行対象（目標レベルではなく、実際に手を動かすタスク） */
export const ACTIONABLE_LEVELS: Task["level"][] = ["week", "day", "month"];

/** 今日の提案・週の達成率の対象。月間は所要時間が入っているもの（＝作業）だけ。年間・四半期などの目標は対象外 */
export function isActionable(t: Pick<Task, "level" | "estimate_minutes">): boolean {
  if (t.level === "week" || t.level === "day") return true;
  return t.level === "month" && t.estimate_minutes > 0;
}

export interface ScoredTask {
  task: Task;
  score: number;
  reasons: string[];
}

export function isBlockedByDependency(task: Task, deps: TaskDependency[], byId: Map<string, Task>): boolean {
  return deps.some((d) => d.task_id === task.id && byId.get(d.depends_on_task_id)?.status !== "done" && byId.has(d.depends_on_task_id));
}

export function scoreTask(task: Task, today: string, evals: Map<string, ActionEvaluation>): ScoredTask {
  const reasons: string[] = [];
  let score = task.priority === 1 ? 30 : task.priority === 2 ? 18 : 8;
  if (task.priority === 1) reasons.push("重要度：高");
  if (task.due_date) {
    const d = diffDays(task.due_date, today);
    if (d < 0) {
      score += 40 + Math.min(20, -d);
      reasons.push(`期限超過 ${-d}日`);
    } else if (d === 0) {
      score += 35;
      reasons.push("今日が期限");
    } else if (d <= 3) {
      score += 25;
      reasons.push(`期限まで${d}日`);
    } else if (d <= 7) {
      score += 15;
      reasons.push("今週が期限");
    } else if (d <= 30) score += 6;
  }
  if (task.mandala_action_id) {
    const e = evals.get(task.mandala_action_id);
    if (e) {
      // 進捗の遅れているマンダラ目標ほど、また期限が近いほど関連タスクを優先
      const behind = (100 - e.progress) / 10;
      score += behind;
      if (e.status === "missed") {
        score += 8;
        reasons.push("関連目標が未達");
      } else if (e.daysLeft != null && e.daysLeft <= 60) {
        score += 6;
        reasons.push("関連目標の期限が近い");
      } else reasons.push("マンダラ目標に直結");
    }
  }
  if (task.status === "doing") {
    score += 5;
    reasons.push("着手済み");
  }
  if (task.level === "day") score += 4;
  return { task, score, reasons };
}

export interface TodayPlan {
  main: ScoredTask | null;
  support: ScoredTask[];
  totalMinutes: number;
  availableMinutes: number;
  skippedForTime: ScoredTask[];
}

/**
 * 未完了・開始済み・依存先が完了しているタスクから、
 * 最重要1件と補助2件を選ぶ。合計の所要時間は実行可能時間を超えない。
 */
export function pickToday(tasks: Task[], deps: TaskDependency[], today: string, availableMinutes: number, evals: Map<string, ActionEvaluation>): TodayPlan {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const candidates = tasks
    .filter((t) => t.status !== "done" && t.status !== "blocked")
    .filter((t) => isActionable(t))
    .filter((t) => !t.start_date || t.start_date <= today)
    .filter((t) => !isBlockedByDependency(t, deps, byId))
    .map((t) => scoreTask(t, today, evals))
    .sort((a, b) => b.score - a.score || (a.task.due_date ?? "9999").localeCompare(b.task.due_date ?? "9999") || a.task.title.localeCompare(b.task.title));

  const avail = Math.max(0, availableMinutes);
  const skipped: ScoredTask[] = [];
  let main: ScoredTask | null = null;
  const support: ScoredTask[] = [];
  let used = 0;
  for (const c of candidates) {
    const m = Math.max(0, c.task.estimate_minutes);
    if (used + m > avail) {
      skipped.push(c);
      continue;
    }
    if (!main) main = c;
    else if (support.length < 2) support.push(c);
    else break;
    used += m;
  }
  return { main, support, totalMinutes: used, availableMinutes: avail, skippedForTime: skipped.slice(0, 3) };
}

export interface WeekStats {
  weekStart: string;
  weekEnd: string;
  total: number;
  done: number;
  rate: number | null;
}

/** 今週（月〜日）が期限のタスクの達成率 */
export function weekStats(tasks: Task[], today: string): WeekStats {
  const ws = weekStart(today);
  const we = addDays(ws, 6);
  const inWeek = tasks.filter((t) => isActionable(t) && t.due_date && t.due_date >= ws && t.due_date <= we);
  const done = inWeek.filter((t) => t.status === "done").length;
  return { weekStart: ws, weekEnd: we, total: inWeek.length, done, rate: inWeek.length ? done / inWeek.length : null };
}

export function overdueTasks(tasks: Task[], today: string): Task[] {
  return tasks
    .filter((t) => t.status !== "done" && t.due_date && t.due_date < today)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
}

/** 依存関係に循環ができないか（task → dependsOn を足したとき） */
export function wouldCreateCycle(deps: TaskDependency[], taskId: string, dependsOn: string): boolean {
  if (taskId === dependsOn) return true;
  const graph = new Map<string, string[]>();
  for (const d of deps) graph.set(d.task_id, [...(graph.get(d.task_id) ?? []), d.depends_on_task_id]);
  graph.set(taskId, [...(graph.get(taskId) ?? []), dependsOn]);
  const seen = new Set<string>();
  const stack = [dependsOn];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === taskId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(graph.get(cur) ?? []));
  }
  return false;
}
