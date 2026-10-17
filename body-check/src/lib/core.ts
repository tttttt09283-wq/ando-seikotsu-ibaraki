import { CORE_RANKS, CORE_TESTS, type CoreTestId } from "@/config/core";

/** 各テストの回答：秒数（左右）またはできばえの点数（左右）。skipped はスキップ */
export type CoreAnswer = { skipped: true } | { left?: number; right?: number; value?: number };
export type CoreAnswers = Partial<Record<CoreTestId, CoreAnswer>>;

export function secondsToPoints(sec: number, th: [number, number, number]): number {
  if (sec >= th[2]) return 4;
  if (sec >= th[1]) return 3;
  if (sec >= th[0]) return 2;
  return 1;
}

export interface CoreItemResult {
  id: CoreTestId;
  name: string;
  points: number; // 1〜4（左右がある場合は低い方）
  detail: string;
  asymmetry: string | null;
}

export function judgeCore(answers: CoreAnswers) {
  const items: CoreItemResult[] = [];
  CORE_TESTS.forEach((t) => {
    const a = answers[t.id];
    if (!a || "skipped" in a) return;
    const toPts = (v: number) => (t.options ? v : secondsToPoints(v, t.thresholds!));
    const fmt = (v: number) => (t.options ? (t.options.find((o) => o.points === v)?.label ?? `${v}点`) : `${Math.round(v)}秒`);
    if (t.bothSides) {
      if (a.left === undefined || a.right === undefined) return;
      const pl = toPts(a.left), pr = toPts(a.right);
      let asymmetry: string | null = null;
      if (t.options ? Math.abs(pl - pr) >= 2 : Math.abs(a.left - a.right) >= 10 || pl !== pr) {
        const weak = (t.options ? pl < pr : a.left < a.right) ? "左" : "右";
        asymmetry = `${weak}側が弱めです（左右差あり）`;
      }
      items.push({ id: t.id, name: t.name, points: Math.min(pl, pr), detail: `左 ${fmt(a.left)}／右 ${fmt(a.right)}`, asymmetry });
    } else {
      if (a.value === undefined) return;
      items.push({ id: t.id, name: t.name, points: toPts(a.value), detail: fmt(a.value), asymmetry: null });
    }
  });
  if (items.length === 0) return null;
  // 4点満点の平均を100点満点に（1点＝25点）
  const score = Math.round((items.reduce((s, i) => s + i.points, 0) / (items.length * 4)) * 100);
  const rank = CORE_RANKS.find((r) => score >= r.min)!;
  const weak = items.filter((i) => i.points <= 2 || i.asymmetry).sort((x, y) => x.points - y.points);
  const selfcare = weak.slice(0, 3).map((w) => CORE_TESTS.find((t) => t.id === w.id)!.selfcare);
  return { score, rank, items, weak, selfcare };
}
