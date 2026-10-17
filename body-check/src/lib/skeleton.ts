import { SKELETON_TYPES, type SkeletonTypeId } from "@/config/skeleton";

export interface SkeletonResult {
  main: SkeletonTypeId;
  sub: SkeletonTypeId | null;
  label: string;
  pct: Record<SkeletonTypeId, number>;
  answered: number;
}

/** 回答（質問ID → タイプ）から骨格タイプを判定する。1位と2位の差が1問以内ならミックス */
export function judgeSkeleton(answers: Record<string, SkeletonTypeId>): SkeletonResult {
  const counts: Record<SkeletonTypeId, number> = { S: 0, W: 0, N: 0 };
  Object.values(answers).forEach((k) => {
    if (k in counts) counts[k] += 1;
  });
  const total = counts.S + counts.W + counts.N;
  const order = (["S", "W", "N"] as SkeletonTypeId[]).sort((a, b) => counts[b] - counts[a]);
  const [top, second] = order;
  const mixed = total > 0 && counts[top] - counts[second] <= 1 && counts[second] > 0;
  const pct = { S: 0, W: 0, N: 0 } as Record<SkeletonTypeId, number>;
  (["S", "W", "N"] as SkeletonTypeId[]).forEach((k) => (pct[k] = total > 0 ? Math.round((counts[k] / total) * 100) : 0));
  return {
    main: top,
    sub: mixed ? second : null,
    label: mixed ? `${SKELETON_TYPES[top].name}×${SKELETON_TYPES[second].name}（ミックス）` : SKELETON_TYPES[top].name,
    pct,
    answered: total,
  };
}
