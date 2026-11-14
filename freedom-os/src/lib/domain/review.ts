// 週間レビューの比較（先週比・先月比・目標比）
import { addDays } from "../date";
import type { UserSettings, WeeklyReview } from "../types";

export interface ReviewComparison {
  review: WeeklyReview;
  revenue: number;
  prevWeek: { revenue: number | null; work: number | null; family: number | null; newCustomers: number | null };
  /** 直近4週の合計 vs その前の4週の合計（どちらもこの週を起点） */
  month: { revenue4w: number; prevRevenue4w: number | null };
  target: { revenueRatio: number | null; familyRatio: number | null; workOver: boolean };
}

const diff = (a: number, b: number | undefined | null) => (b == null ? null : a - b);

export function reviewComparisons(reviews: WeeklyReview[], s: Pick<UserSettings, "target_monthly_revenue" | "family_hours_weekly_target" | "max_weekly_work_hours">): ReviewComparison[] {
  const byWeek = new Map(reviews.map((r) => [r.week_start, r]));
  const weeklyTarget = s.target_monthly_revenue / (52 / 12);
  return [...reviews]
    .sort((a, b) => b.week_start.localeCompare(a.week_start))
    .map((r) => {
      const revenue = r.clinic_revenue + r.ai_revenue;
      const prev = byWeek.get(addDays(r.week_start, -7));
      const sum = (from: number, to: number) => {
        let total = 0;
        let found = 0;
        for (let k = from; k <= to; k++) {
          const w = byWeek.get(addDays(r.week_start, -7 * k));
          if (w) {
            total += w.clinic_revenue + w.ai_revenue;
            found++;
          }
        }
        return { total, found };
      };
      const cur4 = sum(0, 3);
      const prev4 = sum(4, 7);
      return {
        review: r,
        revenue,
        prevWeek: {
          revenue: diff(revenue, prev ? prev.clinic_revenue + prev.ai_revenue : null),
          work: diff(r.work_hours, prev?.work_hours),
          family: diff(r.family_hours, prev?.family_hours),
          newCustomers: diff(r.new_customers, prev?.new_customers),
        },
        month: { revenue4w: cur4.total, prevRevenue4w: prev4.found ? prev4.total : null },
        target: {
          revenueRatio: weeklyTarget > 0 ? revenue / weeklyTarget : null,
          familyRatio: s.family_hours_weekly_target > 0 ? r.family_hours / s.family_hours_weekly_target : null,
          workOver: r.work_hours > s.max_weekly_work_hours,
        },
      };
    });
}
