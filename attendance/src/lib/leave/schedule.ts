/**
 * 年次有給休暇の付与予定（労働基準法39条）。
 * - 入社6か月後に10日、以後1年ごとに 11・12・14・16・18・20日（6年6か月以降は毎年20日）
 * - 週所定労働日数4日以下かつ週30時間未満は比例付与
 * - 出勤率8割以上が条件。出勤率の判定は本部が確認して付与を確定する（ここでは予定日と日数のみ）
 */

const STANDARD_DAYS = [10, 11, 12, 14, 16, 18, 20];
const PROPORTIONAL_DAYS: Record<number, number[]> = {
  4: [7, 8, 9, 10, 12, 13, 15],
  3: [5, 6, 6, 8, 9, 10, 11],
  2: [3, 4, 4, 5, 6, 6, 7],
  1: [1, 2, 2, 2, 3, 3, 3],
};

export interface WorkingConditions {
  weeklyDays: number;
  weeklyMinutes: number;
}

export interface PlannedGrant {
  grantDate: string;
  /** 何回目の付与か（0 = 入社6か月後） */
  index: number;
  days: number;
  type: "statutory" | "proportional";
}

/** 暦日に月数を加算（月末は丸める：1/31 + 1か月 = 2/28） */
export function addMonthsToDate(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function isProportional(c: WorkingConditions): boolean {
  return c.weeklyDays <= 4 && c.weeklyMinutes < 30 * 60;
}

export function statutoryDays(index: number, c: WorkingConditions): { days: number; type: PlannedGrant["type"] } {
  const i = Math.min(index, 6);
  if (isProportional(c)) {
    const row = PROPORTIONAL_DAYS[Math.max(1, Math.min(4, Math.floor(c.weeklyDays)))];
    return { days: row[i], type: "proportional" };
  }
  return { days: STANDARD_DAYS[i], type: "statutory" };
}

/** n 回目の付与日（入社日 + 6か月 + n年） */
export function grantDateOf(hireDate: string, index: number): string {
  return addMonthsToDate(hireDate, 6 + index * 12);
}

/**
 * 次に付与すべき予定。asOf から lookaheadDays 日以内に到来し、まだ付与されていないもののうち最も早いもの。
 * 過去の付与漏れ（予定日が過ぎているのに未付与）も対象に含める。
 */
export function nextPlannedGrant(
  hireDate: string,
  conditions: WorkingConditions,
  grantedDates: string[],
  asOf: string,
  lookaheadDays = 30,
): PlannedGrant | null {
  const limit = new Date(`${asOf}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + lookaheadDays);
  const limitStr = limit.toISOString().slice(0, 10);
  const granted = new Set(grantedDates);
  for (let index = 0; index < 60; index++) {
    const grantDate = grantDateOf(hireDate, index);
    if (grantDate > limitStr) return null;
    if (!granted.has(grantDate)) return { grantDate, index, ...statutoryDays(index, conditions) };
  }
  return null;
}
