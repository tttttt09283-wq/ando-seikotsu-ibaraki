import { PageHeader } from "@/components/common/parts";
import { getAppModel } from "@/lib/server/snapshot";
import { addMonths, monthOf } from "@/lib/date";
import { actualsFormValues } from "@/lib/io/export";
import { ActualsForm } from "./actuals-form";
import { ActualsHistory } from "./history";

export const metadata = { title: "月次実績" };

export default async function ActualsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const { model: m } = await getAppModel();
  const thisMonth = monthOf(m.today);
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? `${sp.month}-01` : thisMonth;
  const values = actualsFormValues(m.snapshot, month);
  const prev = m.actuals.byMonth.get(addMonths(month, -1)) ?? null;
  const history = m.actuals.months
    .filter((x) => x.hasData || x.emergencyFund != null)
    .reverse()
    .map((x) => ({ month: x.month, clinic: x.clinicRevenue, ai: x.aiRevenue, expenses: x.expenses, profit: x.profit, sessions: x.sessions, active: x.activePatients, contracts: x.activeContracts, fund: x.emergencyFund }));
  return (
    <div className="space-y-6">
      <PageHeader
        title="月次実績"
        description="売上・経費・顧客数・家計の実データ（シミュレーションとは別に保存）。空欄は「未入力」、0 は「0円」として区別します。患者様の氏名・症状などは入力しないでください（集計値のみ）。"
      />
      <ActualsForm
        key={month}
        month={month}
        thisMonth={thisMonth}
        values={values}
        prevActive={prev?.activePatients ?? null}
        prevContracts={prev?.activeContracts ?? null}
        taxRate={m.snapshot.settings.tax_social_rate}
        defaults={{ employment: m.snapshot.settings.employment_monthly_takehome, living: m.snapshot.settings.living_cost_monthly }}
      />
      <ActualsHistory rows={history} />
    </div>
  );
}
