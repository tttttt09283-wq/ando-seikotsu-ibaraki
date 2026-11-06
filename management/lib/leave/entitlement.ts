// 有給の法定付与日数（入社日基準：Q-12）
// 継続勤務6か月で初回、以後1年ごと。出勤率8割以上が条件（判定は人が確認する）
// 週の所定労働日数が4日以下かつ週30時間未満の人は比例付与（対象者の扱いは Q-10 で未確定）
import { addMonths } from "../dates";

const FULL = [10, 11, 12, 14, 16, 18, 20];
const PROPORTIONAL: Record<number, number[]> = {
  4: [7, 8, 9, 10, 12, 13, 15],
  3: [5, 6, 6, 8, 9, 10, 11],
  2: [3, 4, 4, 5, 6, 6, 7],
  1: [1, 2, 2, 2, 3, 3, 3],
};

export type Worker = { hire_date: string | null; weekly_work_days?: number | null; weekly_work_hours?: number | null };

// n 回目の付与（0始まり）の付与日：入社日＋6か月＋n年
export function grantDateOf(hireDate: string, index: number): string {
  return addMonths(hireDate, 6 + 12 * index);
}

export function isProportional(w: Worker): boolean {
  const days = w.weekly_work_days ?? null;
  const hours = w.weekly_work_hours ?? null;
  return days !== null && days <= 4 && (hours === null || hours < 30);
}

export function statutoryDays(w: Worker, index: number): number {
  const i = Math.min(index, 6);
  if (!isProportional(w)) return FULL[i];
  const d = Math.max(1, Math.min(4, Math.floor(w.weekly_work_days ?? 4)));
  return PROPORTIONAL[d][i];
}

export type PlannedGrant = { index: number; grantDate: string; days: number; proportional: boolean; countsToward5Day: boolean };

// 期間 [from, to] に来る付与の予定
export function upcomingGrants(w: Worker, from: string, to: string): PlannedGrant[] {
  if (!w.hire_date) return [];
  const out: PlannedGrant[] = [];
  for (let i = 0; i < 80; i++) {
    const g = grantDateOf(w.hire_date, i);
    if (g > to) break;
    if (g >= from) {
      const days = statutoryDays(w, i);
      out.push({ index: i, grantDate: g, days, proportional: isProportional(w), countsToward5Day: days >= 10 });
    }
  }
  return out;
}
