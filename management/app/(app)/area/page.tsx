import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canAnywhere } from "@/server/session";
import { storeKpis } from "@/server/kpi";
import { monthOf } from "@/lib/kpi";
import { jstToday } from "@/lib/time";
import { KpiTable } from "@/components/kpi-table";
import { PendingMinutes } from "@/components/pending-minutes";
import { StoreOverview } from "@/components/store-overview";

export const metadata: Metadata = { title: "エリアダッシュボード" };

// BM：担当エリアの院の状況（閲覧）
export default async function AreaPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  if (!(await canAnywhere("dashboard.area"))) notFound();
  const month = monthOf((await searchParams).month, jstToday());
  const kpis = await storeKpis(month);
  return (
    <>
      <h1 className="text-xl font-black text-brand-800">エリアダッシュボード</h1>
      <KpiTable rows={kpis} month={month} basePath="/area" title="担当エリアの院" />
      <PendingMinutes />
      <StoreOverview />
    </>
  );
}
