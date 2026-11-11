/** 日付は 'YYYY-MM-DD' 文字列で扱い、タイムゾーンのずれを避ける */

export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(v: string): v is IsoDate {
  if (!ISO_DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** 指定タイムゾーンでの「今日」 */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** 指定タイムゾーンでの日付（timestamptz → 日付） */
export function dateInTimeZone(timestamp: string | Date, timeZone: string): IsoDate {
  return todayInTimeZone(timeZone, typeof timestamp === "string" ? new Date(timestamp) : timestamp);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** b - a の暦日数 */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function formatJpDate(date: IsoDate | null | undefined): string {
  if (!date) return "—";
  const [y, m, d] = date.split("-").map(Number);
  return `${y}/${m}/${d}`;
}

export function formatJpDateTime(ts: string | null | undefined, timeZone = "Asia/Tokyo"): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

export function monthStart(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`;
}
