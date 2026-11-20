/**
 * 日時はすべて Asia/Tokyo（JST, UTC+9・サマータイムなし）で扱う。
 * DB には timestamptz（UTC の瞬間）で保存し、表示・枠計算は JST で行う。
 */
export const TZ = "Asia/Tokyo";
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** "YYYY-MM-DD" と "HH:MM" から JST の瞬間を作る */
export function jstDateTime(date: string, time: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error("invalid date/time");
  const d = new Date(`${date}T${time}:00+09:00`);
  if (Number.isNaN(d.getTime())) throw new Error("invalid date/time");
  return d;
}

/** 瞬間 → JST の "YYYY-MM-DD" */
export function jstDateKey(d: Date | string): string {
  const t = new Date(typeof d === "string" ? d : d.getTime());
  return new Date(t.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 瞬間 → JST の "HH:MM" */
export function jstTime(d: Date | string): string {
  const t = new Date(typeof d === "string" ? d : d.getTime());
  return new Date(t.getTime() + JST_OFFSET_MS).toISOString().slice(11, 16);
}

/** JST の曜日（0=日） */
export function jstWeekday(date: string): number {
  // 日付文字列そのものの曜日（タイムゾーンに依存しない）
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function addMinutes(d: Date | string, minutes: number): Date {
  return new Date(new Date(d).getTime() + minutes * 60_000);
}

export function addDaysToKey(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const WEEK_JA = ["日", "月", "火", "水", "木", "金", "土"];

/** 例: 2026年11月20日(金) 10:00 */
export function formatJst(d: Date | string, withTime = true): string {
  const key = jstDateKey(d);
  const [y, m, day] = key.split("-").map(Number);
  const w = WEEK_JA[jstWeekday(key)];
  return `${y}年${m}月${day}日(${w})${withTime ? " " + jstTime(d) : ""}`;
}

/** 例: 2026年11月20日(金) 10:00〜11:30 */
export function formatRange(start: string | Date, end: string | Date): string {
  return `${formatJst(start)}〜${jstTime(end)}`;
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function yen(n: number): string {
  return `${n.toLocaleString("ja-JP")}円`;
}
