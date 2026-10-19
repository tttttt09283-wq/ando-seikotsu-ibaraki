import { addMonths, monthDates, weekdayOf } from "@/lib/time/jst";

/**
 * 前月コピーのコピー元の日付。
 * 曜日を揃えるため「第n○曜日 → 前月の第n○曜日」で対応させる（院ごとの定休日の曜日がずれないように）。
 * 前月に第5○曜日が無い場合は、前月の最後の○曜日をコピー元にする。
 */
export function previousMonthSourceDate(targetDate: string): string {
  const occurrence = Math.floor((Number(targetDate.slice(8, 10)) - 1) / 7); // 0 始まり
  const weekday = weekdayOf(targetDate);
  const sameWeekday = monthDates(addMonths(targetDate.slice(0, 7), -1)).filter((d) => weekdayOf(d) === weekday);
  return sameWeekday[Math.min(occurrence, sameWeekday.length - 1)];
}

/** 対象月の各日付 → コピー元の日付 */
export function previousMonthMapping(targetMonth: string): { target: string; source: string }[] {
  return monthDates(targetMonth).map((target) => ({ target, source: previousMonthSourceDate(target) }));
}
