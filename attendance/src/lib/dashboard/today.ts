/**
 * 本部ダッシュボードの集計（画面に依存しない純粋関数）。
 * - 当日の出勤状況：確定シフトと打刻原本から、出勤予定・出勤済・未打刻・遅刻・早退を判定
 * - 期間の勤怠集計（attendance_summary の結果）を院ごとに合計
 */

export interface TodayShift {
  staffId: string;
  clinicId: string;
  start: string; // ISO
  end: string; // ISO
}

export interface TodayPunch {
  staffId: string;
  punchType: string;
  punchedAt: string; // ISO
}

export type TodayState = "scheduled" | "working" | "left" | "missing";

export interface TodayStatus {
  staffId: string;
  clinicId: string;
  state: TodayState;
  late: boolean;
  earlyLeave: boolean;
  clockIn: string | null;
  clockOut: string | null;
}

/** 開始時刻を過ぎても出勤打刻が無い場合に「未打刻」とするまでの猶予（分） */
export const MISSING_GRACE_MINUTES = 10;

/** 確定シフト（勤務）ごとに当日の状況を判定する。打刻は取消済みを除いたもの */
export function todayStatuses(shifts: TodayShift[], punches: TodayPunch[], now: Date): TodayStatus[] {
  // 同じ人の複数シフト（午前・午後に別院など）は最初のシフトの院で1行にまとめる
  const byStaff = new Map<string, TodayShift[]>();
  for (const s of [...shifts].sort((a, b) => a.start.localeCompare(b.start))) {
    byStaff.set(s.staffId, [...(byStaff.get(s.staffId) ?? []), s]);
  }
  return [...byStaff.entries()].map(([staffId, list]) => {
    const first = list[0];
    const last = list.reduce((a, b) => (b.end > a.end ? b : a));
    const mine = punches.filter((p) => p.staffId === staffId).sort((a, b) => a.punchedAt.localeCompare(b.punchedAt));
    const clockIn = mine.find((p) => p.punchType === "clock_in")?.punchedAt ?? null;
    const clockOut = [...mine].reverse().find((p) => p.punchType === "clock_out")?.punchedAt ?? null;
    const startMs = Date.parse(first.start);
    const state: TodayState = clockOut && (!clockIn || clockOut > clockIn)
      ? "left"
      : clockIn
        ? "working"
        : now.getTime() >= startMs + MISSING_GRACE_MINUTES * 60_000
          ? "missing"
          : "scheduled";
    return {
      staffId,
      clinicId: first.clinicId,
      state,
      late: clockIn !== null && Date.parse(clockIn) - startMs >= 60_000,
      earlyLeave: state === "left" && clockOut !== null && Date.parse(last.end) - Date.parse(clockOut) >= 60_000,
      clockIn,
      clockOut,
    };
  });
}

export interface SummaryRow {
  home_clinic_id: string | null;
  staff_id: string;
  work_days: number;
  worked_minutes: number;
  scheduled_minutes: number;
  overtime_non_statutory_minutes: number;
  overtime_statutory_minutes: number;
  late_night_minutes: number;
  legal_holiday_minutes: number;
  late_count: number;
  early_leave_count: number;
  absent_count: number;
  missing_punch_count: number;
  unconfirmed_days: number;
  needs_recalc_days: number;
}

export type SummaryTotals = Omit<SummaryRow, "home_clinic_id" | "staff_id"> & { staff_count: number };

const SUM_KEYS = [
  "work_days",
  "worked_minutes",
  "scheduled_minutes",
  "overtime_non_statutory_minutes",
  "overtime_statutory_minutes",
  "late_night_minutes",
  "legal_holiday_minutes",
  "late_count",
  "early_leave_count",
  "absent_count",
  "missing_punch_count",
  "unconfirmed_days",
  "needs_recalc_days",
] as const;

export function emptyTotals(): SummaryTotals {
  return { staff_count: 0, ...Object.fromEntries(SUM_KEYS.map((k) => [k, 0])) } as SummaryTotals;
}

/** スタッフ単位の集計を合計する（勤務実績のある人を人数に数える） */
export function sumSummary(rows: SummaryRow[]): SummaryTotals {
  const t = emptyTotals();
  for (const r of rows) {
    for (const k of SUM_KEYS) t[k] += Number(r[k]) || 0;
    if (Number(r.work_days) > 0) t.staff_count += 1;
  }
  return t;
}

/** 院ごとに合計（主所属院が無い行は null のキー） */
export function summaryByClinic(rows: SummaryRow[]): Map<string | null, SummaryTotals> {
  const groups = new Map<string | null, SummaryRow[]>();
  for (const r of rows) groups.set(r.home_clinic_id, [...(groups.get(r.home_clinic_id) ?? []), r]);
  return new Map([...groups.entries()].map(([k, v]) => [k, sumSummary(v)]));
}
