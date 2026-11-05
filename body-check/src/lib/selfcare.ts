/**
 * ===== セルフケア提案ロジック =====
 * 点数が低い項目を優先して、最大3つのセルフケアを選びます。
 * ・スキップした項目には運動を提案しません（痛み・不安があってスキップした可能性があるため）
 * ・何も測定できなかった場合は、誰でも取り組みやすいごく軽い内容（gentle）だけにします
 */
import { CHECK_ORDER } from "@/config/checks";
import { MAX_SELF_CARE_RECOMMENDATIONS, SELF_CARE_ITEMS, type SelfCareItem } from "@/config/selfcare";
import type { CheckId, ScoreResult } from "@/types";

export interface SelfCareRecommendation {
  items: SelfCareItem[];
  /** 注意文（すべてスキップした場合など） */
  notes: string[];
}

export function recommendSelfCare(
  result: ScoreResult,
  catalog: SelfCareItem[] = SELF_CARE_ITEMS,
  max: number = MAX_SELF_CARE_RECOMMENDATIONS,
): SelfCareRecommendation {
  const notes: string[] = [];

  // 優先順：点数の低い順（同点ならチェックの順番）。スキップした項目は対象外。
  const priority: CheckId[] = result.items
    .filter((i) => i.score !== null)
    .sort((a, b) => (a.score as number) - (b.score as number) || CHECK_ORDER.indexOf(a.id) - CHECK_ORDER.indexOf(b.id))
    .map((i) => i.id);

  // 何も採点できなかった場合は、痛みや不安があった可能性もあるので、ごく軽い体幹のケアだけにする
  const nothingMeasured = priority.length === 0;
  if (nothingMeasured) {
    priority.push("plank");
    notes.push("今回は測定できた項目がなかったため、ごく軽い内容だけをご紹介しています。痛みや不安がある場合は、専門スタッフにご相談ください。");
  }

  const usable = (item: SelfCareItem) => !nothingMeasured || item.gentle;
  const byCategory = new Map<CheckId, SelfCareItem[]>(
    priority.map((id) => [id, catalog.filter((item) => item.category === id && usable(item))]),
  );

  // 1周目：各項目から1つずつ → 2周目：足りなければ同じ項目の2つ目以降
  const picked: SelfCareItem[] = [];
  for (let round = 0; picked.length < max; round++) {
    let addedThisRound = false;
    for (const id of priority) {
      const item = byCategory.get(id)?.[round];
      if (item && picked.length < max) {
        picked.push(item);
        addedThisRound = true;
      }
    }
    if (!addedThisRound) break;
  }

  return { items: picked, notes };
}
