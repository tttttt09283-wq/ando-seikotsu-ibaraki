import { PageHeader } from "@/components/common/parts";
import { getAppModel } from "@/lib/server/snapshot";
import { criterionConfig } from "@/lib/domain/criteria";
import { CRITERIA_DEFS } from "@/lib/domain/template";
import { dateJa } from "@/lib/format";
import { CriteriaView } from "./criteria-view";

export const metadata = { title: "独立判定" };

export default async function IndependencePage() {
  const { model: m } = await getAppModel();
  const items = m.criteria.map((c) => {
    const cfg = criterionConfig(m.snapshot.criteria, c.code);
    const def = CRITERIA_DEFS.find((d) => d.code === c.code)!;
    return { ...c, threshold: cfg.threshold, threshold2: cfg.threshold2, manualConfirmed: cfg.manualConfirmed, note: cfg.note, thresholdLabel: def.thresholdLabel ?? null, threshold2Label: def.threshold2Label ?? null };
  });
  return (
    <div>
      <PageHeader
        title="独立判定エンジン"
        description={`独立予定日 ${dateJa(m.snapshot.settings.independence_target_date)}（あと${Math.max(0, m.daysToIndependence)}日）。7つの条件を個別に判定します。単一のスコアや成功確率は出しません。`}
      />
      <CriteriaView items={items} readiness={m.readiness} settings={{ emergencyMin: m.snapshot.settings.emergency_fund_months_min, emergencyTarget: m.snapshot.settings.emergency_fund_months_target, maxHours: m.snapshot.settings.max_weekly_work_hours }} />
    </div>
  );
}
