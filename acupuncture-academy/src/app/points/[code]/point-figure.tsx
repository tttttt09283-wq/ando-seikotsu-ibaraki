"use client";

import * as React from "react";
import { BodyFigure } from "@/components/figures/body-figure";
import { pointPositions } from "@/components/figures/body-geometry";
import { ProvisionalFigureNotice } from "@/components/common/notices";
import type { MeridianId, View } from "@/data/types";
import { cn } from "@/lib/utils";

const label: Record<View, string> = { front: "前面", back: "後面", side: "側面" };

export function PointFigure({ code, meridian }: { code: string; meridian: MeridianId }) {
  const views = (Object.keys(pointPositions[code] ?? {}) as View[]);
  const [view, setView] = React.useState<View>(views[0] ?? "front");
  return (
    <div className="rounded-xl border bg-white p-3">
      {views.length > 1 && (
        <div className="mb-2 flex gap-1">
          {views.map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={cn("flex-1 rounded-md px-2 py-1 text-xs", view === v ? "bg-primary text-white" : "bg-muted")}>
              {label[v]}
            </button>
          ))}
        </div>
      )}
      <BodyFigure view={view} visible={[meridian]} selected={meridian} selectedPoint={code} pointCodes={[code]} className="mx-auto h-[360px] w-full lg:h-[460px]" />
      <ProvisionalFigureNotice className="mt-2" />
    </div>
  );
}
