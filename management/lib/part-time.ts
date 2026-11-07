// アルバイト勤務申請（画面表示・入力時の目安。最終判断は DB の submit_part_time_request）
export type PartTimeCategory = "plan" | "help" | "busy";
export const CATEGORY_LABEL: Record<PartTimeCategory, string> = { plan: "計画（シフト作成前）", help: "緊急ヘルプ（急な欠員）", busy: "繁忙時間帯（土日祝・平日夜間）" };
export const CATEGORY_SHORT: Record<PartTimeCategory, string> = { plan: "計画", help: "緊急ヘルプ", busy: "繁忙時間帯" };

// シフト確定の基準日：勤務する月の前月の cutoffDay 日（Q-20：20日）
export function shiftCutoffFor(workDate: string, cutoffDay = 20): string {
  const [y, m] = workDate.split("-").map(Number);
  const d = Math.min(Math.max(cutoffDay, 1), 28);
  return new Date(Date.UTC(y, m - 2, d)).toISOString().slice(0, 10);
}
export function isAfterCutoff(today: string, workDate: string, cutoffDay = 20): boolean {
  return today > shiftCutoffFor(workDate, cutoffDay);
}

// 実働時間（分）
export function workMinutes(start: string, end: string, breakMinutes = 0): number {
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  return toMin(end) - toMin(start) - breakMinutes;
}
export function fmtMinutes(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "-";
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}時間${m}分` : `${h}時間`;
}
export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");
