import type { QuizQuestion } from "../types";

export const FICTIONAL = "これは教育用に作成した架空の症例です。実在の患者情報は含みません。";

const ids = "abcdefgh";

/** 問題IDから決まる疑似乱数（同じIDなら毎回同じ並び順になる） */
function seeded(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * 小テストを短く書くための補助。
 * options は「正解を書きやすい順」で書いてよい。表示順は問題IDごとに固定のランダム順に並べ替える。
 * answer は options の中の正解の位置（0 から）。配列で渡すと複数選択になる。
 */
export function q(
  id: string,
  prompt: string,
  options: string[],
  answer: number | number[],
  explanation: string,
  topic: string,
  pointCodes?: string[],
): QuizQuestion {
  const correct = new Set(Array.isArray(answer) ? answer : [answer]);
  const rand = seeded(id);
  const order = options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const shuffled = order.map((orig, pos) => ({ id: ids[pos], text: options[orig], correct: correct.has(orig) }));
  return {
    id,
    prompt,
    type: Array.isArray(answer) ? "multiple" : "single",
    options: shuffled.map(({ id: oid, text }) => ({ id: oid, text })),
    answer: shuffled.filter((o) => o.correct).map((o) => o.id),
    explanation,
    topic,
    ...(pointCodes ? { pointCodes } : {}),
  };
}
