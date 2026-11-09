// ダッシュボードの KPI（院ごとの行 → 表示用の値）。純粋関数
export type KpiRow = {
  store_id: string; store_name: string; display_order: number; staff_count: number;
  meetings_held: number; minutes_submitted: number; minutes_on_time: number; minutes_overdue_now: number;
  decisions_due: number; decisions_done: number;
  parttime_total: number; parttime_help: number; parttime_exception: number;
  president_pending: number; shortage_requests: number;
  paid_granted: number | string; paid_taken: number | string; five_day_risk: number;
  shift_remaining: number | string; shift_expired: number | string; rule_unack: number;
};
export type Tone = "ok" | "warn" | "bad" | "none";

export function rate(num: number, den: number): number | null {
  return den > 0 ? Math.round((num / den) * 1000) / 10 : null;
}
export function rateTone(r: number | null, good = 90, fair = 70): Tone {
  if (r === null) return "none";
  return r >= good ? "ok" : r >= fair ? "warn" : "bad";
}
export const countTone = (n: number): Tone => (n > 0 ? "bad" : "ok");
export const fmtRate = (r: number | null) => (r === null ? "－" : `${r}%`);
export const num = (v: number | string) => Number(v) || 0;

// 全院の合計（率は合計から計算し直す）
export function totalRow(rows: KpiRow[]): KpiRow {
  const sum = (k: keyof KpiRow) => rows.reduce((a, r) => a + num(r[k] as number), 0);
  return {
    store_id: "total", store_name: "合計", display_order: 9999, staff_count: sum("staff_count"),
    meetings_held: sum("meetings_held"), minutes_submitted: sum("minutes_submitted"), minutes_on_time: sum("minutes_on_time"), minutes_overdue_now: sum("minutes_overdue_now"),
    decisions_due: sum("decisions_due"), decisions_done: sum("decisions_done"),
    parttime_total: sum("parttime_total"), parttime_help: sum("parttime_help"), parttime_exception: sum("parttime_exception"),
    president_pending: sum("president_pending"), shortage_requests: sum("shortage_requests"),
    paid_granted: sum("paid_granted"), paid_taken: sum("paid_taken"), five_day_risk: sum("five_day_risk"),
    shift_remaining: sum("shift_remaining"), shift_expired: sum("shift_expired"), rule_unack: sum("rule_unack"),
  };
}

// 月の表示・前後の月（"YYYY-MM"）
export function monthOf(param: string | undefined, today: string): string {
  return param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param) ? param : today.slice(0, 7);
}
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
