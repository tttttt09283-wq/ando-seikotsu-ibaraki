/**
 * 復習スケジュール（間隔反復・Leitner 方式）。
 * 正解するたびに箱が一つ上がり、次の復習までの日数が延びる。不正解なら箱0に戻る。
 */
import { addDays, dateKey } from "./dates";
import type { ReviewItem } from "./repository/types";

export const INTERVALS = [1, 3, 7, 14, 30];
export const MASTERED_BOX = INTERVALS.length - 1;

export function scheduleAfter(item: ReviewItem, correct: boolean, today = dateKey()): ReviewItem {
  if (!correct) {
    return { ...item, box: 0, due: today, lastReviewed: today, lapses: item.lapses + 1 };
  }
  const box = Math.min(item.box + 1, MASTERED_BOX);
  return { ...item, box, due: addDays(today, INTERVALS[box]), lastReviewed: today };
}

export function isDue(item: ReviewItem, today = dateKey()): boolean {
  return item.due <= today;
}
