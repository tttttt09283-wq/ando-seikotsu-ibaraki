/** 日本時間（JST）での日付・表示ユーティリティ */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** JSTの日付キー（例: 2026-10-15） */
export function jstDayKey(d: Date): string {
  return new Date(d.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** JSTの月キー（例: 2026-10） */
export function jstMonthKey(d: Date): string {
  return jstDayKey(d).slice(0, 7);
}

const timeFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const dateTimeFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso));
}

export function formatJpy(n: number): string {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

/** 少額（AIコスト）用。1円未満も小数で表示 */
export function formatJpyPrecise(n: number): string {
  if (n === 0) return "¥0";
  if (n < 10) return `¥${n.toFixed(2)}`;
  return formatJpy(n);
}

export function relativeFromNow(iso: string, now: Date): string {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 10) return "たった今";
  if (s < 60) return `${s}秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}
