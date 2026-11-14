import { PageHeader } from "@/components/common/parts";
import { getAppModel } from "@/lib/server/snapshot";
import { criterionConfig } from "@/lib/domain/criteria";
import { DEFAULT_ASSUMPTIONS } from "@/lib/domain/assumptions";
import { monthOf } from "@/lib/date";
import { Simulator, type SimScenario, type SimContext } from "./simulator";

export const metadata = { title: "独立収益シミュレーター" };

export default async function SimulatorPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const { model: m } = await getAppModel();
  const st = m.snapshot.settings;
  const scenarios: SimScenario[] = m.scenarios.map((x) => ({
    id: x.scenario.id,
    kind: x.scenario.kind,
    name: x.scenario.name,
    description: x.scenario.description,
    horizon: x.scenario.horizon_months,
    isPrimary: x.scenario.id === m.primary?.scenario.id,
    assumptions: x.assumptions,
    defaults: DEFAULT_ASSUMPTIONS[x.scenario.kind],
  }));
  const latest = m.actuals.latest;
  const ctx: SimContext = {
    today: m.today,
    startMonth: monthOf(m.today),
    independenceDate: st.independence_target_date,
    taxSocialRate: st.tax_social_rate,
    livingCost: m.actuals.latestHousehold?.livingCost ?? st.living_cost_monthly,
    employmentTakehome: st.employment_monthly_takehome,
    employmentWeeklyHours: st.employment_weekly_hours,
    weeklyDiscretionaryHours: st.weekly_discretionary_hours,
    initialBalance: m.actuals.latestHousehold?.emergencyFund ?? null,
    initialActivePatients: m.actuals.latestActivePatients,
    initialContracts: m.actuals.latestActiveContracts,
    targets: { clinic: st.target_clinic_revenue, ai: st.target_ai_revenue, total: st.target_monthly_revenue },
    emergencyMonths: st.emergency_fund_months_min,
    maxWeeklyHours: st.max_weekly_work_hours,
    familyTarget: st.family_hours_weekly_target,
    profitThreshold: criterionConfig(m.snapshot.criteria, "profit").threshold ?? 0,
    activePatientsMin: criterionConfig(m.snapshot.criteria, "clinic_retention").threshold ?? 0,
    contractsMin: criterionConfig(m.snapshot.criteria, "ai_stability").threshold ?? 0,
    actual: latest
      ? {
          month: latest.month,
          sessions: latest.sessions,
          clinicRevenue: latest.clinicRevenue,
          aiRevenue: latest.aiRevenue,
          activePatients: m.actuals.latestActivePatients,
          contracts: m.actuals.latestActiveContracts,
        }
      : null,
  };
  return (
    <div>
      <PageHeader title="独立収益シミュレーター" description="数値を変えるとすぐに再計算されます。保存するとダッシュボード・マンダラの見込み・独立判定に反映されます。すべて仮定に基づく試算です。" />
      <Simulator scenarios={scenarios} ctx={ctx} initialTab={sp.tab === "compare" || sp.tab === "reverse" ? sp.tab : "calc"} />
    </div>
  );
}
