import { addDays, clampedDate, daysBetween, shiftWeekend, weekdayOf } from "./dates";
import type { RecurringRule } from "./types";

export type Occurrence = {
  /** 本来の日（繰返しの「何回目か」を表すキー。DB の occurrence_date） */
  occurrenceDate: string;
  /** 土日を前後の平日にずらした、実際にお金が動く予定日 */
  date: string;
};

type RuleShape = Pick<RecurringRule, "frequency" | "interval_count" | "day_of_month" | "weekday" | "month_of_year" | "start_date" | "end_date" | "weekend_shift">;

/**
 * 繰返し設定から、本来の日が [from, to] に入る回を列挙する。
 * - 毎月 31 日（など）は、その月の末日に丸める（2月は28日、閏年は29日）
 * - 毎年 2月29日 は、閏年でない年は 2月28日
 * - 開始日より前・終了日より後の回は作らない（本来の日で判定）
 */
export function expandRule(rule: RuleShape, from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  const end = rule.end_date && rule.end_date < to ? rule.end_date : to;
  const push = (nominal: string) => {
    if (nominal < rule.start_date || nominal < from || nominal > end) return;
    out.push({ occurrenceDate: nominal, date: shiftWeekend(nominal, rule.weekend_shift) });
  };
  const step = Math.max(1, rule.interval_count);
  const [sy, sm] = rule.start_date.split("-").map(Number);

  if (rule.frequency === "monthly") {
    // 開始月から step か月ごと
    for (let i = 0; i < 2400; i += step) {
      const y = sy + Math.floor((sm - 1 + i) / 12);
      const m = ((sm - 1 + i) % 12) + 1;
      const nominal = clampedDate(y, m, rule.day_of_month ?? 1);
      if (nominal > end) break;
      push(nominal);
    }
  } else if (rule.frequency === "yearly") {
    const m = rule.month_of_year ?? sm;
    for (let y = sy; ; y += step) {
      const nominal = clampedDate(y, m, rule.day_of_month ?? 1);
      if (nominal > end) break;
      push(nominal);
    }
  } else {
    // 毎週：開始日以降の最初の指定曜日から 7×step 日ごと
    const first = addDays(rule.start_date, ((rule.weekday ?? 0) - weekdayOf(rule.start_date) + 7) % 7);
    const period = 7 * step;
    const skip = from > first ? Math.ceil(daysBetween(first, from) / period) : 0;
    for (let d = addDays(first, skip * period); d <= end; d = addDays(d, period)) push(d);
  }
  return out;
}
