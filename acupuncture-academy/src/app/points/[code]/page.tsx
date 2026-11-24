import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { pointMap, points } from "@/data/points";
import { PointDetail } from "@/components/points/point-detail";
import { PointFigure } from "./point-figure";

export function generateStaticParams() {
  return points.map((p) => ({ code: p.code }));
}

export async function generateMetadata({ params }: PageProps<"/points/[code]">): Promise<Metadata> {
  const { code } = await params;
  const p = pointMap[code];
  return { title: p ? `${p.name}（${p.code}）` : "経穴" };
}

export default async function PointPage({ params }: PageProps<"/points/[code]">) {
  const { code } = await params;
  const point = pointMap[code];
  if (!point) notFound();
  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/points" className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
        <ChevronLeft className="size-3.5" />
        経穴辞典
      </Link>
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <PointDetail point={point} />
        <aside className="order-first lg:order-none">
          <div className="lg:sticky lg:top-20">
            <PointFigure code={point.code} meridian={point.meridian} />
          </div>
        </aside>
      </div>
    </div>
  );
}
