/**
 * 日付・時刻ユーティリティ。
 * - タイムスタンプは UTC で保存し、表示は Asia/Tokyo。
 * - 業務日付（勤務日・付与日など）は日本時間の暦日 "YYYY-MM-DD" 文字列で扱う。
 */

export const TIME_ZONE = "Asia/Tokyo";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 指定時刻の日本時間での暦日（YYYY-MM-DD） */
export function jstDate(at: Date = new Date()): string {
  return dateFormatter.format(at);
}

/** 日本時間の「今日」 */
export function todayJst(now: Date = new Date()): string {
  return jstDate(now);
}

/** UTC タイムスタンプを日本時間の「YYYY/MM/DD HH:mm」で表示 */
export function formatJstDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  return dateTimeFormatter.format(date);
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD として実在する日付か */
export function isValidDateString(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** 暦日に日数を加算（タイムゾーンの影響を受けない） */
export function addDays(dateString: string, days: number): string {
  const [y, m, d] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** 日本時間の暦日＋時刻（HH:mm）を UTC の Date に変換。日本は夏時間がないため +09:00 固定 */
export function jstDateTimeToUtc(dateString: string, time: string): Date {
  return new Date(`${dateString}T${time}:00+09:00`);
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** YYYY-MM 形式の年月か */
export function isValidMonth(value: string): boolean {
  return MONTH_PATTERN.test(value);
}

/** 年月に月数を加算（YYYY-MM） */
export function addMonths(month: string, months: number): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, 1));
  return date.toISOString().slice(0, 7);
}

/** その月のすべての日付（YYYY-MM-DD） */
export function monthDates(month: string): string[] {
  const first = `${month}-01`;
  const dates: string[] = [];
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) dates.push(d);
  return dates;
}

/** 曜日（0=日曜 … 6=土曜） */
export function weekdayOf(dateString: string): number {
  const [y, m, d] = dateString.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;
