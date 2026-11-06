export const LEAVE_TYPE_CODES = ["PAID", "SHIFT", "SHIFT_HOLIDAY", "COMP"] as const;
export type LeaveTypeCode = (typeof LEAVE_TYPE_CODES)[number];
export const LEAVE_TYPE_LABEL: Record<LeaveTypeCode, string> = {
  PAID: "有給休暇", SHIFT: "振替（公休出勤）", SHIFT_HOLIDAY: "祝振替（祝日出勤）", COMP: "代休",
};
export const LEAVE_SHORT_LABEL: Record<LeaveTypeCode, string> = { PAID: "有給", SHIFT: "振替", SHIFT_HOLIDAY: "祝振替", COMP: "代休" };

// CSV・入力で使われる呼び方 → 区分
export function leaveTypeFromLabel(label: string): LeaveTypeCode | null {
  const v = label.replace(/[\s　]/g, "");
  if (["有給", "有休", "有給休暇", "年休", "PAID"].includes(v)) return "PAID";
  if (["振替", "振休", "振替休日", "公休振替", "SHIFT"].includes(v)) return "SHIFT";
  if (["祝振替", "祝振", "祝日振替", "SHIFT_HOLIDAY"].includes(v)) return "SHIFT_HOLIDAY";
  if (["代休", "COMP"].includes(v)) return "COMP";
  return null;
}

export type Balance = {
  type: LeaveTypeCode; as_of: string; granted: number; adjusted: number; taken: number; planned: number; pending: number;
  current: number; after_planned: number; lapsed: number; overdue: number; overdue_since: string | null;
  next_expiry_date: string | null; next_expiry_days: number;
};
export type GrantState = {
  grant_id: string; grant_date: string; expires_on: string; source: string; days: number; adjusted: number;
  taken: number; planned: number; remaining: number; state: "active" | "expired_lapsed" | "expired_alert" | "future";
};
export type FiveDay =
  | { target: false }
  | { target: true; base_date: string; period_start: string; period_end: string; required: number; taken: number; planned: number;
      remaining_required: number; days_left: number; level: "done" | "planned_ok" | "ok" | "caution" | "warning" | "urgent" };

export const FIVE_DAY_LABEL: Record<string, { text: string; tone: "ok" | "neutral" | "warn" | "danger" }> = {
  done: { text: "5日取得済み", tone: "ok" },
  planned_ok: { text: "予定込みで5日", tone: "ok" },
  ok: { text: "順調", tone: "neutral" },
  caution: { text: "注意", tone: "warn" },
  warning: { text: "警告", tone: "danger" },
  urgent: { text: "至急", tone: "danger" },
};

export function fmtDays(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return `${Number(v).toLocaleString("ja-JP", { maximumFractionDigits: 2 })}日`;
}
