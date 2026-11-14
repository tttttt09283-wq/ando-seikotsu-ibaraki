import { PageHeader } from "@/components/common/parts";
import { getAppModel } from "@/lib/server/snapshot";
import { TasksView, type TaskRow } from "./tasks-view";

export const metadata = { title: "タスク" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ action?: string; new?: string }> }) {
  const sp = await searchParams;
  const { model: m } = await getAppModel();
  const s = m.snapshot;
  const plan = m.todayPlan;
  const todayIds = [plan.main?.task.id, ...plan.support.map((x) => x.task.id)].filter(Boolean) as string[];
  const blockedBy = new Map<string, string[]>();
  for (const d of s.dependencies) blockedBy.set(d.task_id, [...(blockedBy.get(d.task_id) ?? []), d.depends_on_task_id]);
  const tasks: TaskRow[] = s.tasks.map((t) => ({
    ...t,
    code: t.mandala_action_id ? m.codeOfAction.get(t.mandala_action_id) ?? "" : "",
    dependsOn: blockedBy.get(t.id) ?? [],
  }));
  const actionOptions = [...m.actionByCode.entries()]
    .filter(([, a]) => a.title)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, a]) => ({ id: a.id, label: `${code} ${a.title}` }));
  return (
    <div>
      <PageHeader title="タスク" description={`今日の提案：最重要1＋補助2（1日に使える時間 ${s.settings.daily_available_minutes}分の範囲内）。完了したタスクは実績として記録されます。`} />
      <TasksView
        tasks={tasks}
        today={m.today}
        todayIds={todayIds}
        reasons={Object.fromEntries([plan.main, ...plan.support].filter(Boolean).map((x) => [x!.task.id, x!.reasons]))}
        week={m.week}
        actionOptions={actionOptions}
        initialAction={sp.action ?? ""}
        openNew={sp.new === "1"}
      />
    </div>
  );
}
