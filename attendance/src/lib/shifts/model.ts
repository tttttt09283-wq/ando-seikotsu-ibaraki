import { jstDate } from "@/lib/time/jst";

export type ShiftType =
  | "work"
  | "scheduled_holiday"
  | "legal_holiday"
  | "paid_leave"
  | "holiday_credit_leave"
  | "other_leave";
export type ShiftStatus = "draft" | "confirmed" | "revised" | "cancelled";

export const SHIFT_TYPE_LABELS: Record<ShiftType, string> = {
  work: "勤務",
  scheduled_holiday: "休み",
  legal_holiday: "法定休日",
  paid_leave: "有給",
  holiday_credit_leave: "振休",
  other_leave: "休暇",
};

export const SHIFT_STATUS_LABELS: Record<ShiftStatus, string> = {
  draft: "下書き",
  confirmed: "確定",
  revised: "確定後変更",
  cancelled: "取消",
};

/** DB の shifts 行 */
export interface ShiftRow {
  shift_id: string;
  staff_id: string;
  clinic_id: string;
  work_date: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  scheduled_break_minutes: number;
  shift_type: ShiftType;
  status: ShiftStatus;
  version: number;
  template_id: string | null;
  note: string | null;
}

/** 画面用：時刻は日本時間の HH:mm */
export interface ShiftView {
  shiftId: string;
  staffId: string;
  clinicId: string;
  workDate: string;
  type: ShiftType;
  status: ShiftStatus;
  version: number;
  start: string | null;
  end: string | null;
  endsNextDay: boolean;
  breakMinutes: number;
  /** 拘束時間 − 休憩 */
  workMinutes: number;
  /** 拘束時間（分） */
  spanMinutes: number;
  templateId: string | null;
  note: string | null;
}

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const jstTime = (value: string) => timeFormatter.format(new Date(value));

export function toShiftView(row: ShiftRow): ShiftView {
  const span =
    row.scheduled_start && row.scheduled_end
      ? Math.round((new Date(row.scheduled_end).getTime() - new Date(row.scheduled_start).getTime()) / 60000)
      : 0;
  return {
    shiftId: row.shift_id,
    staffId: row.staff_id,
    clinicId: row.clinic_id,
    workDate: row.work_date,
    type: row.shift_type,
    status: row.status,
    version: row.version,
    start: row.scheduled_start ? jstTime(row.scheduled_start) : null,
    end: row.scheduled_end ? jstTime(row.scheduled_end) : null,
    endsNextDay: Boolean(row.scheduled_end && jstDate(new Date(row.scheduled_end)) > row.work_date),
    breakMinutes: row.scheduled_break_minutes,
    workMinutes: Math.max(0, span - row.scheduled_break_minutes),
    spanMinutes: span,
    templateId: row.template_id,
    note: row.note,
  };
}

/** "HH:mm" 同士の拘束時間（分）。終了が開始以下なら翌日終了とみなす */
export function spanBetween(start: string, end: string): number {
  const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const diff = toMinutes(end) - toMinutes(start);
  return diff > 0 ? diff : diff + 24 * 60;
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

export function shiftLabel(s: Pick<ShiftView, "type" | "start" | "end" | "endsNextDay">): string {
  if (s.type !== "work") return SHIFT_TYPE_LABELS[s.type];
  return `${s.start}-${s.endsNextDay ? "翌" : ""}${s.end}`;
}
