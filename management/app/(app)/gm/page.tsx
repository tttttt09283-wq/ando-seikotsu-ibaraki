import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { can } from "@/server/session";
import { StoreOverview } from "@/components/store-overview";
import { PhaseNote } from "@/components/phase-note";

export const metadata: Metadata = { title: "GMダッシュボード" };

export default async function GmPage() {
  if (!(await can("dashboard.gm"))) notFound();
  return (
    <>
      <h1 className="text-xl font-black text-brand-800">GMダッシュボード</h1>
      <PhaseNote phase="PHASE 9">議事録提出率・承認待ち・有給取得率・年5日未達見込みなど全院のKPIを表示します。</PhaseNote>
      <StoreOverview />
    </>
  );
}
