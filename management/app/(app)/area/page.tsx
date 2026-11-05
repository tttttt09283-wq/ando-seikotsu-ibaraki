import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canAnywhere } from "@/server/session";
import { StoreOverview } from "@/components/store-overview";
import { PhaseNote } from "@/components/phase-note";

export const metadata: Metadata = { title: "エリアダッシュボード" };

export default async function AreaPage() {
  if (!(await canAnywhere("dashboard.area"))) notFound();
  return (
    <>
      <h1 className="text-xl font-black text-brand-800">エリアダッシュボード</h1>
      <PhaseNote phase="PHASE 9">担当エリアの院の申請・会議・休暇の状況を表示します。</PhaseNote>
      <StoreOverview />
    </>
  );
}
