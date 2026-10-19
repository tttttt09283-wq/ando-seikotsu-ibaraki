import { addDays, weekdayOf } from "@/lib/time/jst";
import type { ShiftView } from "./model";

/**
 * シフト作成時の警告（保存は止めない。DB で禁止しているもの＝時間の重複などは保存時にエラーになる）
 *
 * 判定基準（確定ルール：1日8時間・週5日・週40時間、院ごとの診療時間）
 * - 休憩不足：労働6時間超で45分未満、8時間超で60分未満（労基法34条）
 * - 1日8時間超・週40時間超・週6日以上の勤務
 * - 休診日の勤務、診療時間外を含む勤務、祝日勤務（振休の対象）
 * - シフト未作成：主所属スタッフに、院の診療日の勤務・休みが1件も無い
 */

export type WarningLevel = "error" | "warn" | "info";

export interface ShiftWarning {
  level: WarningLevel;
  code:
    | "break_shortage"
    | "daily_over"
    | "weekly_over"
    | "weekly_days_over"
    | "closed_day"
    | "outside_hours"
    | "holiday_work"
    | "work_and_day_off"
    | "missing"
    | "no_staff";
  staffId?: string;
  date?: string;
  message: string;
}

export interface ClinicDay {
  date: string;
  /** その日の診療枠（HH:mm）。空なら休診 */
  slots: { open: string; close: string }[];
  holidayName: string | null;
}

export const DAILY_LIMIT_MINUTES = 8 * 60;
export const WEEKLY_LIMIT_MINUTES = 40 * 60;
export const WEEKLY_DAYS_LIMIT = 5;

/** 労基法34条の最低休憩時間 */
export function requiredBreakMinutes(workMinutes: number): number {
  if (workMinutes > 8 * 60) return 60;
  if (workMinutes > 6 * 60) return 45;
  return 0;
}

const work = (shifts: ShiftView[]) => shifts.filter((s) => s.type === "work" && s.status !== "cancelled");
const active = (shifts: ShiftView[]) => shifts.filter((s) => s.status !== "cancelled");

/**
 * 1人・1日分の警告。
 * @param shifts その日のスタッフの全シフト（他院分を含めてよい）
 * @param day    この院のその日の診療情報
 * @param clinicId 表示中の院（休診・診療時間の判定はこの院のシフトだけに行う）
 */
export function dayWarnings(staffId: string, shifts: ShiftView[], day: ClinicDay, clinicId: string): ShiftWarning[] {
  const warnings: ShiftWarning[] = [];
  const date = day.date;
  const workShifts = work(shifts);
  const here = workShifts.filter((s) => s.clinicId === clinicId);

  for (const s of workShifts) {
    // 休憩は1日の拘束時間で判定する（複数シフトの間の空き時間も休憩とみなせるため、まず合算前のシフト単位で判定）
    const required = requiredBreakMinutes(s.spanMinutes - s.breakMinutes);
    if (s.breakMinutes < required) {
      warnings.push({
        level: "warn",
        code: "break_shortage",
        staffId,
        date,
        message: `休憩不足：労働${Math.floor((s.spanMinutes - s.breakMinutes) / 60)}時間超には${required}分以上の休憩が必要です`,
      });
    }
  }

  const total = workShifts.reduce((sum, s) => sum + s.workMinutes, 0);
  if (total > DAILY_LIMIT_MINUTES) {
    warnings.push({ level: "warn", code: "daily_over", staffId, date, message: `1日8時間を超えています（予定 ${(total / 60).toFixed(1)}時間）` });
  }

  if (here.length > 0 && day.slots.length === 0) {
    warnings.push({ level: "warn", code: "closed_day", staffId, date, message: "休診日に勤務が入っています" });
  } else if (here.length > 0) {
    const open = day.slots.map((s) => s.open).sort()[0];
    const close = day.slots.map((s) => s.close).sort().at(-1) as string;
    const outside = here.some((s) => (s.start as string) < open || s.endsNextDay || (s.end as string) > close);
    if (outside) {
      warnings.push({ level: "info", code: "outside_hours", staffId, date, message: `診療時間（${open}〜${close}）外を含む勤務です` });
    }
  }

  if (here.length > 0 && day.holidayName) {
    warnings.push({ level: "info", code: "holiday_work", staffId, date, message: `祝日（${day.holidayName}）の勤務：振休の対象です` });
  }

  if (workShifts.length > 0 && active(shifts).some((s) => s.type !== "work")) {
    warnings.push({ level: "error", code: "work_and_day_off", staffId, date, message: "同じ日に勤務と休み（休暇）が両方入っています" });
  }

  return warnings;
}

/** 日曜始まりの週ごとに、勤務日数と労働時間を判定する */
export function weeklyWarnings(staffId: string, shifts: ShiftView[], dates: string[]): ShiftWarning[] {
  const warnings: ShiftWarning[] = [];
  const weekStarts = [...new Set(dates.map((d) => addDays(d, -weekdayOf(d))))];
  for (const weekStart of weekStarts) {
    const weekEnd = addDays(weekStart, 6);
    const inWeek = work(shifts).filter((s) => s.workDate >= weekStart && s.workDate <= weekEnd);
    const days = new Set(inWeek.map((s) => s.workDate)).size;
    const minutes = inWeek.reduce((sum, s) => sum + s.workMinutes, 0);
    if (days > WEEKLY_DAYS_LIMIT) {
      warnings.push({ level: "warn", code: "weekly_days_over", staffId, date: weekStart, message: `${weekStart}の週：勤務が${days}日あります（週5日を超過）` });
    }
    if (minutes > WEEKLY_LIMIT_MINUTES) {
      warnings.push({
        level: "warn",
        code: "weekly_over",
        staffId,
        date: weekStart,
        message: `${weekStart}の週：予定労働 ${(minutes / 60).toFixed(1)}時間（週40時間を超過）`,
      });
    }
  }
  return warnings;
}

/** 主所属スタッフで、院の診療日に勤務・休みが1件も入っていない日 */
export function missingDates(shifts: ShiftView[], days: ClinicDay[], isAssigned: (date: string) => boolean): string[] {
  const covered = new Set(active(shifts).map((s) => s.workDate));
  return days.filter((d) => d.slots.length > 0 && isAssigned(d.date) && !covered.has(d.date)).map((d) => d.date);
}

/** 診療日なのに院の勤務者が0人の日 */
export function noStaffDates(clinicShifts: ShiftView[], days: ClinicDay[]): string[] {
  const staffed = new Set(work(clinicShifts).map((s) => s.workDate));
  return days.filter((d) => d.slots.length > 0 && !staffed.has(d.date)).map((d) => d.date);
}
