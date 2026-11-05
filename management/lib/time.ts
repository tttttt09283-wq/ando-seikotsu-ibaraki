// 日本時間の日付（端末やサーバーのタイムゾーンに依存しない）
export function jstToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function formatJstDateTime(iso: string | Date): string {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "-";
  const [y, m, day] = d.split("-").map(Number);
  const w = "日月火水木金土"[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
  return `${y}年${m}月${day}日（${w}）`;
}
