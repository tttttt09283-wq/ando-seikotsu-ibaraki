import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cases } from "@/data/cases";
import { PageHeader } from "@/components/common/page-header";
import { ReviewStatusBadge } from "@/components/common/badges";
import { FictionalCaseNotice } from "@/components/common/notices";

export const metadata: Metadata = { title: "症例演習" };

const flow = ["危険徴候", "鑑別", "関連経絡", "証", "治則", "経穴と理由", "評価"];

export default function CasesPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="CASE STUDY"
        title="症例演習"
        description="症状・既往歴・服薬・身体所見・舌脈所見から、7つの判断を順番に行います。回答ごとに正誤だけでなく判断の根拠を解説します。"
      />
      <ol className="mb-6 flex flex-wrap gap-1.5 text-xs">
        {flow.map((f, i) => (
          <li key={f} className="rounded-full bg-accent px-2.5 py-1 text-primary">
            {i + 1}. {f}
          </li>
        ))}
      </ol>
      <FictionalCaseNotice className="mb-4" text="初期版の症例はすべて教育用の架空症例です。患者の個人情報は扱いません。" />
      <ul className="space-y-3">
        {cases.map((c) => (
          <li key={c.id}>
            <Link href={`/cases/${c.id}`} className="flex items-center gap-3 rounded-xl border bg-white p-4 hover:border-primary/40">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] text-white">{c.level}</span>
                  <ReviewStatusBadge status={c.reviewStatus} short />
                </div>
                <p className="font-semibold">{c.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{c.profile}</p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">腰痛・坐骨神経痛・五十肩・神経難病の症例は今後追加予定です。</p>
    </div>
  );
}
