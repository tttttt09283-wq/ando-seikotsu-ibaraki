import { PageHeader } from "@/components/common/parts";
import { getAppModel } from "@/lib/server/snapshot";
import { KPI_SOURCE_MAP } from "@/lib/domain/mandala";
import { minDate } from "@/lib/date";
import { Gantt, type GanttGroup, type GanttMilestone } from "./gantt";
import { MilestoneList } from "./milestones";

export const metadata = { title: "ロードマップ" };

export default async function RoadmapPage() {
  const { model: m } = await getAppModel();
  const s = m.snapshot;
  const st = s.settings;
  const groups: GanttGroup[] = m.goalProgress.map((gp) => {
    const acts = s.actions.filter((a) => a.goal_id === gp.goal.id && a.title).sort((a, b) => a.position - b.position);
    return {
      code: gp.goal.code,
      title: gp.goal.title,
      progress: gp.progress,
      items: acts.map((a) => {
        const e = m.evals.get(a.id)!;
        const tasks = s.tasks.filter((t) => t.mandala_action_id === a.id);
        const start = minDate(...tasks.map((t) => t.start_date), (a.created_at ?? "").slice(0, 10) || null) ?? st.roadmap_start;
        return {
          id: a.id,
          code: m.codeOfAction.get(a.id) ?? "",
          title: a.title,
          start: minDate(start, a.due_date) ?? start,
          end: a.due_date,
          progress: e.progress,
          status: e.status,
          tasks: tasks
            .filter((t) => t.start_date || t.due_date)
            .sort((x, y) => (x.start_date ?? x.due_date ?? "").localeCompare(y.start_date ?? y.due_date ?? ""))
            .map((t) => ({ id: t.id, title: t.title, start: t.start_date ?? t.due_date!, end: t.due_date ?? t.start_date!, status: t.status, level: t.level })),
        };
      }),
    };
  });
  const loose = s.tasks.filter((t) => !t.mandala_action_id && (t.start_date || t.due_date)).map((t) => ({ id: t.id, title: t.title, start: t.start_date ?? t.due_date!, end: t.due_date ?? t.start_date!, status: t.status, level: t.level }));
  const latestAnnual = m.actuals.trailing12Months ? m.actuals.trailing12Profit : null;
  const milestones: GanttMilestone[] = s.milestones
    .sort((a, b) => a.target_date.localeCompare(b.target_date))
    .map((x) => {
      const src = KPI_SOURCE_MAP.get(x.metric);
      const current = x.metric === "annual_business_income" ? latestAnnual : src && x.metric !== "none" ? src.resolve(m.kpiContext) : null;
      return { ...x, current, metricLabel: src?.label ?? "" };
    });
  return (
    <div className="space-y-6">
      <PageHeader title="ロードマップ" description="マンダラの領域別目標・マイルストーン・タスクを時間軸で確認します。赤は期限を過ぎて未完了の項目です。" />
      <Gantt start={st.roadmap_start} end={st.roadmap_end} today={m.today} groups={groups} loose={loose} milestones={milestones} deps={s.dependencies.map((d) => ({ from: d.depends_on_task_id, to: d.task_id }))} />
      <MilestoneList milestones={milestones} />
    </div>
  );
}
