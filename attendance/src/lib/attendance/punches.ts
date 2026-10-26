import { addDays } from "@/lib/time/jst";

export interface PunchLike {
  event_id: string;
  punch_type: string;
  punched_at: string;
}

/**
 * その日の勤務の打刻だけを返す。翌日（正午まで）の打刻は、日跨ぎの勤務が終わっていない場合だけ含め、
 * 翌日の出勤打刻以降（翌日の勤務）は含めない。
 */
export function punchesOfDay<T extends PunchLike>(sorted: T[], nextDayStart: number): T[] {
  const sameDay = sorted.filter((p) => Date.parse(p.punched_at) < nextDayStart);
  if (sameDay.length === 0 || sameDay[sameDay.length - 1].punch_type === "clock_out") return sameDay;
  const out = [...sameDay];
  for (const p of sorted.filter((x) => Date.parse(x.punched_at) >= nextDayStart)) {
    if (p.punch_type === "clock_in") break;
    out.push(p);
    if (p.punch_type === "clock_out") break;
  }
  return out;
}

const dayStart = (date: string) => Date.parse(`${date}T00:00:00+09:00`);

/**
 * 1か月分などの打刻（時刻順）を勤務日ごとに分ける。前日の日跨ぎ勤務の続き（翌朝の退勤など）は前日に入れる。
 * dates の前日の打刻も渡すと、月初の日に前月末の勤務の続きが混ざらない。
 */
export function groupPunchesByDay<T extends PunchLike>(sorted: T[], dates: string[]): Map<string, T[]> {
  const result = new Map<string, T[]>();
  if (dates.length === 0) return result;
  const used = new Set<string>();
  for (const date of [addDays(dates[0], -1), ...dates]) {
    const start = dayStart(date);
    const next = dayStart(addDays(date, 1));
    const limit = next + 12 * 3600_000;
    const candidates = sorted.filter((p) => !used.has(p.event_id) && Date.parse(p.punched_at) >= start && Date.parse(p.punched_at) < limit);
    const mine = punchesOfDay(candidates, next);
    for (const p of mine) used.add(p.event_id);
    if (date !== addDays(dates[0], -1)) result.set(date, mine);
  }
  return result;
}
