/** ローカル日付を YYYY-MM-DD で返す */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

/** 週の始まり（月曜）の日付キー */
export function weekStart(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dow = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - dow);
  return dateKey(date);
}

export function formatJpDate(key: string): string {
  const [, m, d] = key.split("-").map(Number);
  return `${m}/${d}`;
}

export function formatMinutes(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min}分`;
  return `${Math.floor(min / 60)}時間${min % 60 ? `${min % 60}分` : ""}`;
}
