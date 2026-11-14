// マンダラの行動を「年間→四半期→月間→週間→今日」に分解する（ルールベース。保存前にプレビューする）
import { addDays, diffDays, endOfMonth, minDate, quarterOf, weekStart } from "../date";
import type { MandalaAction, TaskLevel } from "../types";

export interface DraftTask {
  tempId: string;
  parentTempId: string | null;
  level: TaskLevel;
  title: string;
  purpose: string;
  start_date: string;
  due_date: string;
  estimate_minutes: number;
  priority: number;
  deliverable: string;
  done_criteria: string;
}

function fmtKpi(v: number, unit: string): string {
  if (unit === "円") return v >= 10000 ? `${Math.round(v / 1000) / 10}万円` : `${Math.round(v)}円`;
  const r = Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${r}${unit}`;
}

/** 期限までの直線補間で、ある日付時点の KPI 中間目標 */
export function interpolateKpi(current: number, target: number, start: string, due: string, at: string): number {
  const total = diffDays(due, start);
  if (total <= 0) return target;
  const p = Math.min(1, Math.max(0, diffDays(at, start) / total));
  return current + (target - current) * p;
}

export function generatePlan(action: MandalaAction, code: string, today: string, currentKpi: number | null): DraftTask[] {
  const out: DraftTask[] = [];
  const due = action.due_date && action.due_date > today ? action.due_date : addDays(today, 90);
  const hasKpi = action.kpi_target != null && action.kpi_name.trim() !== "";
  const cur = currentKpi ?? 0;
  const target = action.kpi_target ?? 0;
  const label = `${code} ${action.title}`;
  const kpiAt = (d: string) => (hasKpi ? `（${action.kpi_name} ${fmtKpi(interpolateKpi(cur, target, today, due, d), action.kpi_unit)}）` : "");
  let n = 0;
  const id = () => `draft-${++n}`;
  const pr = action.priority || 2;

  // 年間目標（1年を超える行動のみ）
  const spanDays = diffDays(due, today);
  const yearIds = new Map<number, string>();
  if (spanDays > 365) {
    const y0 = Number(today.slice(0, 4));
    const y1 = Number(due.slice(0, 4));
    for (let y = y0; y <= Math.min(y1, y0 + 5); y++) {
      const yDue = minDate(`${y}-12-31`, due)!;
      const tid = id();
      yearIds.set(y, tid);
      out.push({
        tempId: tid,
        parentTempId: null,
        level: "year",
        title: `${y}年：${action.title}${y === y1 ? "を達成" : "に向けた到達点"}${kpiAt(yDue)}`,
        purpose: `${label} の年間目標`,
        start_date: y === y0 ? today : `${y}-01-01`,
        due_date: yDue,
        estimate_minutes: 0,
        priority: pr,
        deliverable: "",
        done_criteria: hasKpi ? `${action.kpi_name}が年末時点の中間目標に到達している` : "年間の到達点を振り返り、次年度の目標を決めている",
      });
    }
  }

  // 四半期目標（今期から最大4期）
  const quarterIds: string[] = [];
  let qStart = quarterOf(today).start;
  for (let k = 0; k < 4; k++) {
    const q = quarterOf(qStart);
    if (q.start > due) break;
    const qDue = minDate(q.end, due)!;
    const tid = id();
    quarterIds.push(tid);
    out.push({
      tempId: tid,
      parentTempId: yearIds.get(q.year) ?? null,
      level: "quarter",
      title: `${q.year}年Q${q.q}：${action.title}${kpiAt(qDue)}`,
      purpose: `${label} の四半期目標`,
      start_date: k === 0 ? today : q.start,
      due_date: qDue,
      estimate_minutes: 0,
      priority: pr,
      deliverable: "",
      done_criteria: hasKpi ? `${action.kpi_name}が四半期の中間目標に到達している` : "四半期の成果物ができている",
    });
    qStart = addDays(q.end, 1);
  }

  // 今月の目標
  const mDue = minDate(endOfMonth(today), due)!;
  const monthId = id();
  out.push({
    tempId: monthId,
    parentTempId: quarterIds[0] ?? null,
    level: "month",
    title: `今月：${action.title}の${hasKpi ? "施策を実行し実績を記録する" : "たたき台を完成させる"}${kpiAt(mDue)}`,
    purpose: `${label} の月間目標`,
    start_date: today,
    due_date: mDue,
    estimate_minutes: 0,
    priority: pr,
    deliverable: hasKpi ? "月次実績の入力" : `${action.title}のたたき台`,
    done_criteria: hasKpi ? "月末に実績値を入力し、目標との差を確認している" : "たたき台を見直し、次の改善点が決まっている",
  });

  // 今週のタスク（3件）
  const wEnd = minDate(addDays(weekStart(today), 6), due)!;
  const weekly: Omit<DraftTask, "tempId" | "parentTempId" | "level" | "start_date" | "priority">[] = hasKpi
    ? [
        { title: `${action.kpi_name}の現状値を確認し、月次実績に記録する`, purpose: "現在地を数字で把握する", due_date: wEnd, estimate_minutes: 20, deliverable: "月次実績の入力", done_criteria: "最新の値が入力されている" },
        { title: `${action.kpi_name}を伸ばす施策を3つ書き出す`, purpose: "目標との差を埋める手段を決める", due_date: wEnd, estimate_minutes: 30, deliverable: "施策メモ（3案）", done_criteria: "3案と、それぞれの期待効果が書かれている" },
        { title: "施策を1つ選んで実行する", purpose: "行動で数字を動かす", due_date: wEnd, estimate_minutes: 60, deliverable: "実行記録", done_criteria: "実行した内容と結果をメモに残している" },
      ]
    : [
        { title: `${action.title}の完了条件を書き出す`, purpose: "何ができたら達成かを明確にする", due_date: wEnd, estimate_minutes: 20, deliverable: "完了条件メモ", done_criteria: "完了条件が3つ以内で書かれている" },
        { title: `${action.title}に必要な情報を集め、相談先を決める`, purpose: "判断材料をそろえる", due_date: wEnd, estimate_minutes: 45, deliverable: "情報メモ・相談先リスト", done_criteria: "次に誰に何を聞くかが決まっている" },
        { title: `${action.title}のたたき台を作る`, purpose: "最初の成果物を形にする", due_date: wEnd, estimate_minutes: 60, deliverable: "たたき台", done_criteria: "人に見せられる下書きがある" },
      ];
  const weekIds: string[] = [];
  for (const w of weekly) {
    const tid = id();
    weekIds.push(tid);
    out.push({ ...w, tempId: tid, parentTempId: monthId, level: "week", start_date: today, priority: pr });
  }

  // 今日の行動（15分）
  out.push({
    tempId: id(),
    parentTempId: weekIds[0] ?? monthId,
    level: "day",
    title: `今日の15分：${weekly[0].title}`,
    purpose: "最初の一歩を今日踏み出す",
    start_date: today,
    due_date: today,
    estimate_minutes: 15,
    priority: pr,
    deliverable: "",
    done_criteria: "15分取り組んだ",
  });
  return out;
}
