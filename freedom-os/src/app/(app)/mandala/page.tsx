import { PageHeader } from "@/components/common/parts";
import { getAppModel } from "@/lib/server/snapshot";
import { actionLinkage } from "@/lib/domain/model";
import { AREA_CODES } from "@/lib/types";
import { MandalaBoard, type BoardAction, type BoardGoal } from "./board";

export const metadata = { title: "マンダラチャート" };

export default async function MandalaPage() {
  const { model: m } = await getAppModel();
  const s = m.snapshot;
  const center = m.goalByCode.get("CENTER") ?? null;
  const goals: BoardGoal[] = AREA_CODES.map((code) => {
    const g = m.goalByCode.get(code);
    const gp = m.goalProgress.find((x) => x.goal.code === code);
    return { id: g?.id ?? "", code, title: g?.title ?? "", description: g?.description ?? "", progress: gp?.progress ?? 0, counts: gp?.counts ?? { not_started: 0, in_progress: 0, achieved: 0, missed: 0 } };
  });
  const actions: BoardAction[] = s.actions.map((a) => {
    const e = m.evals.get(a.id)!;
    const goal = s.goals.find((g) => g.id === a.goal_id);
    return {
      ...a,
      code: m.codeOfAction.get(a.id) ?? "",
      areaCode: goal?.code ?? "",
      eval: e,
      linkage: actionLinkage(m, a),
      tasks: s.tasks
        .filter((t) => t.mandala_action_id === a.id)
        .sort((x, y) => (x.due_date ?? "9").localeCompare(y.due_date ?? "9"))
        .map((t) => ({ id: t.id, title: t.title, status: t.status, due_date: t.due_date, level: t.level })),
    };
  });
  return (
    <div>
      <PageHeader title="81マス・マンダラチャート" description="マスをタップすると、詳細・現在の数字・必要な行動を確認して編集できます" />
      <MandalaBoard center={center ? { id: center.id, title: center.title, description: center.description } : null} goals={goals} actions={actions} overall={m.mandalaProgress} today={m.today} />
    </div>
  );
}
