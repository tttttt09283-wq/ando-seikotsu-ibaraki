import { PageHeader } from "@/components/common/parts";
import { getAppModel } from "@/lib/server/snapshot";
import { addDays, weekStart, weekdayJa } from "@/lib/date";
import { reviewComparisons } from "@/lib/domain/review";
import { ReviewView } from "./review-view";

export const metadata = { title: "週間レビュー" };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const sp = await searchParams;
  const { model: m } = await getAppModel();
  const s = m.snapshot;
  const thisWeek = weekStart(m.today);
  const week = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? weekStart(sp.week) : thisWeek;
  const existing = s.reviews.find((r) => r.week_start === week) ?? null;
  const weekEnd = addDays(week, 6);
  const doneInWeek = s.tasks.filter((t) => t.status === "done" && t.completed_at && t.completed_at >= week && t.completed_at <= weekEnd).length;
  const comps = reviewComparisons(s.reviews, s.settings);
  return (
    <div>
      <PageHeader title="週間レビュー" description={`毎週日曜日に1週間を振り返ります。今日は${weekdayJa(m.today)}曜日です。`} />
      <ReviewView
        key={week}
        week={week}
        thisWeek={thisWeek}
        existing={existing}
        autoTasksDone={doneInWeek}
        latestContracts={m.actuals.latestActiveContracts}
        history={comps}
        targets={{ revenueWeekly: Math.round(s.settings.target_monthly_revenue / (52 / 12)), family: s.settings.family_hours_weekly_target, maxWork: s.settings.max_weekly_work_hours }}
      />
    </div>
  );
}
