// 日付はすべて「日本時間の暦日」を "YYYY-MM-DD" 文字列で扱う。
// サーバー（Vercel は UTC）でもブラウザでも同じ結果になるよう、Date のローカル時刻には依存しない。

const JST = "Asia/Tokyo";

/** 指定時刻の日本時間の日付 "YYYY-MM-DD" */
export function jstDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: JST, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** "YYYY-MM-DD" を UTC 0時の Date に（日付計算専用） */
export function toUTC(d: string): Date {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, day || 1));
}
export function fromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isValidDate(d: unknown): d is string {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = toUTC(d);
  return fromUTC(dt) === d;
}

export function addDays(d: string, n: number): string {
  return fromUTC(new Date(toUTC(d).getTime() + n * 86400000));
}

export function diffDays(a: string, b: string): number {
  // a - b（日数）
  return Math.round((toUTC(a).getTime() - toUTC(b).getTime()) / 86400000);
}

/** 月初 "YYYY-MM-01" */
export function monthOf(d: string): string {
  return `${d.slice(0, 7)}-01`;
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.slice(0, 7).split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-01`;
}

/** 月の差（b から a まで何か月か） */
export function diffMonths(a: string, b: string): number {
  const [ay, am] = a.slice(0, 7).split("-").map(Number);
  const [by, bm] = b.slice(0, 7).split("-").map(Number);
  return ay * 12 + am - (by * 12 + bm);
}

export function monthRange(from: string, count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => addMonths(from, i));
}

export function daysInMonth(month: string): number {
  const next = addMonths(month, 1);
  return diffDays(next, monthOf(month));
}

/** ISO 週（月曜始まり）の月曜日 */
export function weekStart(d: string): string {
  const dt = toUTC(d);
  const dow = dt.getUTCDay(); // 0=日
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDays(d, offset);
}

export function weekdayJa(d: string): string {
  return ["日", "月", "火", "水", "木", "金", "土"][toUTC(d).getUTCDay()];
}

export function quarterOf(d: string): { year: number; q: number; start: string; end: string } {
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  const q = Math.floor((m - 1) / 3) + 1;
  const start = `${y}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`;
  const end = addDays(addMonths(start, 3), -1);
  return { year: y, q, start, end };
}

export function endOfMonth(month: string): string {
  return addDays(addMonths(monthOf(month), 1), -1);
}

export function minDate(...ds: (string | null | undefined)[]): string | null {
  const v = ds.filter((x): x is string => !!x).sort();
  return v[0] ?? null;
}
export function maxDate(...ds: (string | null | undefined)[]): string | null {
  const v = ds.filter((x): x is string => !!x).sort();
  return v[v.length - 1] ?? null;
}
