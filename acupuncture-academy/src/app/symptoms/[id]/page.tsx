import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { symptomGuides, symptomMap } from "@/data/symptoms";
import { SymptomTool } from "./symptom-tool";

export function generateStaticParams() {
  return symptomGuides.map((g) => ({ id: g.id }));
}

export async function generateMetadata({ params }: PageProps<"/symptoms/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: symptomMap[id] ? `${symptomMap[id].name}の取穴` : "症状から取穴" };
}

export default async function SymptomPage({ params }: PageProps<"/symptoms/[id]">) {
  const { id } = await params;
  const guide = symptomMap[id];
  if (!guide) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/symptoms" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
        <ChevronLeft className="size-3.5" />
        症状から取穴
      </Link>
      <SymptomTool guideId={guide.id} />
    </div>
  );
}
