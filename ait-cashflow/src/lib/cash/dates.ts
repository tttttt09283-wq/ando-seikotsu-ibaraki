/**
 * 日付は Asia/Tokyo の暦日（YYYY-MM-DD の文字列）で扱う。
 * 計算は UTC の Date で行い、端末やサーバーのタイムゾーンに左右されないようにする。
 */

const TZ = "Asia/Tokyo";
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 今日（Asia/Tokyo） */
export function todayJst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function isValidDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

function toUtc(s: string): number {
  const m = DATE_RE.exec(s);
  if (!m) throw new Error(`日付の形式が正しくありません: ${s}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromUtc(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

export function addDays(s: string, n: number): string {
  return fromUtc(toUtc(s) + n * 86_400_000);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/** 年・月・日から日付を作る。日がその月にない（31日・2月29日など）ときは月末に丸める */
export function clampedDate(y: number, m: number, d: number): string {
  const day = Math.min(d, daysInMonth(y, m));
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 曜日（0=日曜 … 6=土曜） */
export function weekdayOf(s: string): number {
  return new Date(toUtc(s)).getUTCDay();
}

export function isWeekend(s: string): boolean {
  const w = weekdayOf(s);
  return w === 0 || w === 6;
}

/** 土日を前後の平日にずらす（祝日は今後対応） */
export function shiftWeekend(s: string, shift: "none" | "previous" | "next"): string {
  if (shift === "none" || !isWeekend(s)) return s;
  const w = weekdayOf(s);
  if (shift === "previous") return addDays(s, w === 6 ? -1 : -2);
  return addDays(s, w === 6 ? 2 : 1);
}

export function formatJpDate(s: string, withWeekday = true): string {
  const m = DATE_RE.exec(s);
  if (!m) return s;
  const w = "日月火水木金土"[weekdayOf(s)];
  return `${Number(m[2])}月${Number(m[3])}日${withWeekday ? `（${w}）` : ""}`;
}

export function formatDateTimeJst(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
