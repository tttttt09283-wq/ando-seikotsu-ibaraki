import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { EducationNotice } from "@/components/common/notices";
import { SymptomSearch } from "./symptom-search";

export const metadata: Metadata = { title: "症状から取穴" };

export default function SymptomsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        eyebrow="POINT SELECTION"
        title="症状から取穴を考える"
        description="症状を検索し、危険徴候の確認 → 部位から経絡 → 所見から証 → 局所・遠隔・背景の順に、取穴の候補と根拠を組み立てます。講義で学んだ考え方を臨床の順番で練習するためのツールです。"
      />
      <SymptomSearch />
      <EducationNotice />
    </div>
  );
}
