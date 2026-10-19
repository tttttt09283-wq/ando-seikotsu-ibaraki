/** 勤怠の表示用ラベル */

export const ANOMALY_LABELS: Record<string, { label: string; level: "error" | "warn" | "info" }> = {
  missing_clock_out: { label: "退勤打刻なし", level: "error" },
  missing_break_end: { label: "休憩終了なし", level: "error" },
  clock_out_without_in: { label: "出勤打刻なし", level: "error" },
  orphan_break: { label: "休憩打刻の不整合", level: "error" },
  delayed_submission: { label: "遅延送信", level: "warn" },
  unassigned_clinic: { label: "所属外の院で打刻", level: "warn" },
  unscheduled_work: { label: "シフト外勤務", level: "warn" },
  break_shortage: { label: "休憩不足", level: "warn" },
  changed_after_confirm: { label: "確認後に再計算で変更", level: "warn" },
};

export const DAY_TYPE_LABELS: Record<string, string> = {
  workday: "勤務日",
  legal_holiday: "法定休日",
  scheduled_holiday: "所定休日",
  company_holiday: "会社休日",
};

export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  open: "未確認",
  manager_confirmed: "院長確認済み",
  closed: "締め済み",
};

export const PUNCH_TYPE_LABELS: Record<string, string> = {
  clock_in: "出勤",
  break_start: "休憩開始",
  break_end: "休憩終了",
  clock_out: "退勤",
};

/** 分 → "8:05" */
export function hm(minutes: number | null | undefined): string {
  if (!minutes) return "0:00";
  const sign = minutes < 0 ? "-" : "";
  const m = Math.abs(minutes);
  return `${sign}${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** みなし残業（固定残業）を超えた法定時間外（別途支給が必要な分） */
export function fixedOvertimeExcess(statutoryOvertimeMinutes: number, fixedOvertimeMinutes: number): number {
  return Math.max(0, statutoryOvertimeMinutes - fixedOvertimeMinutes);
}

export const CLOSING_STATUS_LABELS: Record<string, { label: string; tone: "gray" | "yellow" | "green" | "red" }> = {
  open: { label: "未締め", tone: "gray" },
  manager_confirmed: { label: "院長確認済み", tone: "yellow" },
  closed: { label: "締め済み", tone: "green" },
  reopened: { label: "再開中", tone: "red" },
};
