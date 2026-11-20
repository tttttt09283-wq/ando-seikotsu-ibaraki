"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { flowOrder } from "@/data/meridians";
import { BodyFigure } from "./body-figure";
import { FlowCycleFigure, LimbDirectionFigure, MeridianSystemFigure } from "./diagrams";
import { ProvisionalFigureNotice } from "@/components/common/notices";

export function FigureRenderer({ id }: { id: string }) {
  switch (id) {
    case "meridian-system":
      return <MeridianSystemFigure />;
    case "limb-direction":
      return <LimbDirectionFigure />;
    case "flow-cycle":
      return <FlowCycleFigure />;
    case "body-preview":
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {(["front", "back", "side"] as const).map((v) => (
              <BodyFigure key={v} view={v} visible={flowOrder} showLabels={false} pointCodes={[]} className="w-full" />
            ))}
          </div>
          <ProvisionalFigureNotice />
          <Button asChild variant="outline" className="w-full">
            <Link href="/meridians">
              経絡マップで詳しく見る
              <ArrowRight />
            </Link>
          </Button>
        </div>
      );
    default:
      return <p className="text-sm text-verify">図「{id}」は準備中です。</p>;
  }
}
