"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { BodyFigure } from "@/components/figures/body-figure";
import { meridianPaths } from "@/components/figures/body-geometry";
import { FlowCycleFigure } from "@/components/figures/diagrams";
import { ProvisionalFigureNotice } from "@/components/common/notices";
import { ReviewStatusBadge } from "@/components/common/badges";
import { PointDetail } from "@/components/points/point-detail";
import { flowOrder, meridianMap, meridians } from "@/data/meridians";
import { pointMap, points } from "@/data/points";
import type { MeridianId, View } from "@/data/types";

export function MeridianMap() {
  const [view, setView] = React.useState<View>("front");
  const [visible, setVisible] = React.useState<MeridianId[]>(flowOrder);
  const [selected, setSelected] = React.useState<MeridianId | null>(null);
  const [pointCode, setPointCode] = React.useState<string | null>(null);
  const [isDesktop, setIsDesktop] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setIsDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const toggle = (id: MeridianId) => setVisible((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  const select = (id: MeridianId) => {
    setSelected((s) => (s === id ? null : id));
    setVisible((v) => (v.includes(id) ? v : [...v, id]));
  };

  const m = selected ? meridianMap[selected] : null;
  const prev = m ? meridians.find((x) => x.next === m.id)! : null;
  const ownPoints = m ? points.filter((p) => p.meridian === m.id) : [];
  const shownInView = (id: MeridianId) => Boolean(meridianPaths[view][id]);
  const point = pointCode ? pointMap[pointCode] : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div className="space-y-3">
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList className="w-full">
            <TabsTrigger value="front">前面</TabsTrigger>
            <TabsTrigger value="back">後面</TabsTrigger>
            <TabsTrigger value="side">側面</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="rounded-2xl border bg-white p-2">
          <BodyFigure
            view={view}
            visible={visible}
            selected={selected}
            selectedPoint={pointCode}
            onSelectMeridian={select}
            onSelectPoint={setPointCode}
            className="mx-auto h-[min(68dvh,560px)] w-full touch-manipulation"
          />
        </div>
        <ProvisionalFigureNotice />
      </div>

      <div className="space-y-5">
        <section className="rounded-xl border bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-primary">十二経脈の表示</h2>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setVisible(flowOrder)}>
                <Eye />
                すべて
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setVisible([]);
                  setSelected(null);
                }}
              >
                <EyeOff />
                解除
              </Button>
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {flowOrder.map((id) => {
              const mm = meridianMap[id];
              const on = visible.includes(id);
              return (
                <li key={id} className="flex">
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    aria-pressed={on}
                    className={cn("flex flex-1 items-center gap-2 rounded-l-lg border px-2.5 py-2 text-left text-xs", on ? "bg-white" : "bg-muted text-muted-foreground")}
                  >
                    <span className="h-1 w-4 shrink-0 rounded" style={{ background: on ? mm.color : "#cbd5e1" }} />
                    <span className="truncate">{mm.short}</span>
                    {!shownInView(id) && <span className="ml-auto text-[9px] text-muted-foreground">この面なし</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => select(id)}
                    aria-label={`${mm.name}の詳細`}
                    className={cn("rounded-r-lg border border-l-0 px-2 text-[10px]", selected === id ? "bg-primary text-white" : "bg-white text-primary")}
                  >
                    詳細
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {m && prev ? (
          <section className="space-y-4 rounded-xl border bg-white p-4" style={{ borderTop: `4px solid ${m.color}` }} aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold" style={{ color: m.color }}>
                  {m.name}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {m.id}・{m.limb}の{m.yinYang}経・{m.channel}・{m.organ}に属す・{m.pointCount}穴
                </p>
              </div>
              <ReviewStatusBadge status={m.reviewStatus} short />
            </div>

            <div>
              <h3 className="mb-2 text-xs font-bold text-muted-foreground">流注のつながり</h3>
              <div className="flex items-center gap-1.5 text-xs">
                <button type="button" onClick={() => select(prev.id)} className="rounded-md border px-2 py-1.5" style={{ color: prev.color }}>
                  {prev.short}
                </button>
                <ArrowRight className="size-3.5 text-muted-foreground" />
                <span className="rounded-md px-2 py-1.5 font-bold text-white" style={{ background: m.color }}>
                  {m.short}
                </span>
                <ArrowRight className="size-3.5 text-muted-foreground" />
                <button type="button" onClick={() => select(m.next)} className="rounded-md border px-2 py-1.5" style={{ color: meridianMap[m.next].color }}>
                  {meridianMap[m.next].short}
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {m.start.name}（{m.start.code}）に始まり {m.end.name}（{m.end.code}）に終わる。{m.connection}。
              </p>
            </div>

            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <span className="text-xs font-bold text-muted-foreground">表裏関係：</span>
              <button type="button" className="font-semibold underline" style={{ color: meridianMap[m.pair].color }} onClick={() => select(m.pair)}>
                {meridianMap[m.pair].name}
              </button>
              <span className="text-muted-foreground">（{m.organ}と{meridianMap[m.pair].organ}の{m.yinYang === "陰" ? "陰" : "陽"}側）</span>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-bold text-muted-foreground">流注（伝統理論）</h3>
              <ol className="space-y-1.5 text-sm leading-relaxed">
                {m.flow.map((f, i) => (
                  <li key={f} className="flex gap-2">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: m.color }}>
                      {i + 1}
                    </span>
                    {f}
                  </li>
                ))}
              </ol>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-bold text-muted-foreground">主な病候（伝統理論・要確認）</h3>
              <ul className="flex flex-wrap gap-1.5">
                {m.symptoms.map((s) => (
                  <li key={s} className="rounded-md bg-secondary px-2 py-1 text-xs">
                    {s}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-bold text-muted-foreground">所属経穴（全{m.pointCount}穴のうち辞典収録分）</h3>
              {ownPoints.length ? (
                <ul className="flex flex-wrap gap-2">
                  {ownPoints.map((p) => (
                    <li key={p.code}>
                      <button type="button" onClick={() => setPointCode(p.code)} className="rounded-lg border px-3 py-2 text-sm hover:border-primary/40">
                        {p.name} <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">この経脈の経穴は今後辞典に追加予定です。</p>
              )}
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-dashed bg-white p-4 text-sm text-muted-foreground">
            経絡の線、または上の一覧の「詳細」を選ぶと、流注・表裏関係・所属経穴が表示されます。
          </section>
        )}

        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-2 text-sm font-bold text-primary">流注の循環</h2>
          <FlowCycleFigure highlight={selected} />
        </section>
      </div>

      <Sheet open={!!point} onOpenChange={(o) => !o && setPointCode(null)}>
        <SheetContent side={isDesktop ? "right" : "bottom"} className="overflow-y-auto">
          <SheetHeader className="sr-only">
            <SheetTitle>{point ? `${point.name}（${point.code}）` : "経穴"}</SheetTitle>
            <SheetDescription>経穴の詳細</SheetDescription>
          </SheetHeader>
          {point && (
            <div className="space-y-4 p-5 pt-8">
              <PointDetail point={point} headingLevel="h2" />
              <Button asChild className="w-full" variant="outline">
                <Link href={`/points/${point.code}`}>経穴辞典のページで開く</Link>
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
