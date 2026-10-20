/**
 * 休日管理カレンダー（1人・12か月）の組み立て。
 * 本部が登録した区分を表示し、区分の無い日はシステムの記録（確定シフト・承認済みの休暇・勤怠）から「参考」を出す。
 */
import { addDays, addMonths, weekdayOf } from "@/lib/time/jst";
import { DAY_CODES, type DayCode } from "./codes";

export interface CalendarInput {
  fromMonth: string; // YYYY-MM（12か月）
  records: { work_date: string; code: DayCode; source: string }[];
  shifts: { work_date: string; shift_type: string }[];
  attendance: { work_date: string; worked_minutes: number; day_type: string; is_absent: boolean; late_minutes: number; early_leave_minutes: number }[];
  leaves: { start_date: string; end_date: string; leave_type: string; unit: string }[];
  closedMonths: string[]; // YYYY-MM
}

export interface CalendarDay {
  date: string;
  day: number;
  weekday: number;
  code: DayCode | null;
  source: string | null;
  hint: string | null; // 区分の無い日の参考（システムの記録）
  closed: boolean;
}

export interface CalendarMonth {
  month: string;
  days: CalendarDay[];
}

const SHIFT_HINTS: Record<string, string> = {
  scheduled_holiday: "休み",
  legal_holiday: "法定休日",
  paid_leave: "有休",
  holiday_credit_leave: "振休・代休",
  other_leave: "その他休暇",
};

function leaveHint(l: { leave_type: string; unit: string }) {
  const half = l.unit === "am" || l.unit === "pm";
  if (l.leave_type === "paid") return l.unit === "hour" ? "時間休" : half ? "半休" : "有休";
  if (l.leave_type === "holiday_credit") return half ? "振・代半休" : "振休・代休";
  return "その他休暇";
}

export function periodMonths(fromMonth: string): string[] {
  return Array.from({ length: 12 }, (_, i) => addMonths(fromMonth, i));
}

export function buildCalendar(input: CalendarInput): CalendarMonth[] {
  const records = new Map(input.records.map((r) => [r.work_date, r]));
  const shifts = new Map<string, string[]>();
  for (const s of input.shifts) shifts.set(s.work_date, [...(shifts.get(s.work_date) ?? []), s.shift_type]);
  const attendance = new Map(input.attendance.map((a) => [a.work_date, a]));
  const closed = new Set(input.closedMonths);

  return periodMonths(input.fromMonth).map((month) => {
    const days: CalendarDay[] = [];
    for (let date = `${month}-01`; date.startsWith(month); date = addDays(date, 1)) {
      const r = records.get(date);
      const a = attendance.get(date);
      const leave = input.leaves.find((l) => l.start_date <= date && l.end_date >= date);
      const dayShifts = shifts.get(date) ?? [];
      let hint: string | null = null;
      if (!r) {
        if (a && a.worked_minutes > 0 && (a.day_type === "legal_holiday" || a.day_type === "scheduled_holiday")) hint = "休出";
        else if (leave) hint = leaveHint(leave);
        else if (a?.is_absent) hint = "欠勤";
        else if (dayShifts.length > 0 && !dayShifts.includes("work")) hint = SHIFT_HINTS[dayShifts[0]] ?? "休み";
        else if (a && a.late_minutes > 0) hint = "遅刻";
        else if (a && a.early_leave_minutes > 0) hint = "早退";
      }
      days.push({
        date,
        day: Number(date.slice(8)),
        weekday: weekdayOf(date),
        code: r?.code ?? null,
        source: r?.source ?? null,
        hint,
        closed: closed.has(month),
      });
    }
    return { month, days };
  });
}

/** 期間の区分ごとの日数 */
export function countCodes(months: CalendarMonth[]): Record<DayCode, number> {
  const counts = Object.fromEntries(DAY_CODES.map((c) => [c.code, 0])) as Record<DayCode, number>;
  for (const m of months) for (const d of m.days) if (d.code) counts[d.code] += 1;
  return counts;
}

/** 基準日方式なら直近の基準日の月、それ以外は今年の1月を期間の始まりにする */
export function defaultFromMonth(today: string, firstBaseDate: string | null): string {
  if (!firstBaseDate) return `${today.slice(0, 4)}-01`;
  const md = firstBaseDate.slice(5, 7);
  const thisYear = `${today.slice(0, 4)}-${md}`;
  return `${today.slice(0, 7) >= thisYear ? today.slice(0, 4) : String(Number(today.slice(0, 4)) - 1)}-${md}`;
}
