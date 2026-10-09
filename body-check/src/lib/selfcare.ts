/**
 * ===== セルフケア提案ロジック =====
 * 点数が低い項目を優先して、最大3つのセルフケアを選びます。
 * ・スキップした項目には運動を提案しません（不安があってスキップした可能性があるため）
 * ・肩に「痛みがある」と回答した場合、肩の運動は提案しません
 * ・日常生活の痛みが「よくある」場合は、ごく軽い内容（gentle）だけに絞ります
 */
import { CHECK_ORDER } from "@/config/checks";
import { MAX_SELF_CARE_RECOMMENDATIONS, SELF_CARE_ITEMS, type SelfCareItem } from "@/config/selfcare";
import type { CheckId, ScoreResult } from "@/types";

export interface SelfCareRecommendation {
  items: SelfCareItem[];
  /** 専門家への相談をおすすめする注意文（痛みの回答がある場合） */
  notes: string[];
}

export function recommendSelfCare(
  result: ScoreResult,
  catalog: SelfCareItem[] = SELF_CARE_ITEMS,
  max: number = MAX_SELF_CARE_RECOMMENDATIONS,
): SelfCareRecommendation {
  const notes: string[] = [];
  const { shoulderPain, dailyPainOften } = result.painFlags;

  if (shoulderPain) {
    notes.push(
      "肩に痛みがあるとのことなので、肩の運動はおすすめしていません。痛みが続く場合は、医療機関や専門スタッフにご相談ください。",
    );
  }
  if (dailyPainOften) {
    notes.push(
      "日常生活で痛みを感じることが多いとのことなので、ごく軽い内容だけをご紹介しています。痛みの原因を確かめるために、まずは専門家への相談をおすすめします。",
    );
  }

  // 優先順：点数の低い順（同点ならチェックの順番）。スキップした項目は対象外。
  const priority: CheckId[] = result.items
    .filter((i) => i.score !== null)
    .filter((i) => !(shoulderPain && i.id === "shoulder"))
    .sort((a, b) => (a.score as number) - (b.score as number) || CHECK_ORDER.indexOf(a.id) - CHECK_ORDER.indexOf(b.id))
    .map((i) => i.id);

  // 何も採点できなかった場合でも、誰でも取り組みやすいコンディション系を候補にする
  if (priority.length === 0) priority.push("condition");

  const usable = (item: SelfCareItem) => !dailyPainOften || item.gentle;
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
