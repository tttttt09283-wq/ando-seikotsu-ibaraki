import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { caseMap, cases } from "@/data/cases";
import { CaseRunner } from "./case-runner";

export function generateStaticParams() {
  return cases.map((c) => ({ caseId: c.id }));
}

export async function generateMetadata({ params }: PageProps<"/cases/[caseId]">): Promise<Metadata> {
  const { caseId } = await params;
  return { title: caseMap[caseId]?.title ?? "症例演習" };
}

export default async function CasePage({ params }: PageProps<"/cases/[caseId]">) {
  const { caseId } = await params;
  const c = caseMap[caseId];
  if (!c) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/cases" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
        <ChevronLeft className="size-3.5" />
        症例演習
      </Link>
      <CaseRunner clinicalCase={c} />
    </div>
  );
}
