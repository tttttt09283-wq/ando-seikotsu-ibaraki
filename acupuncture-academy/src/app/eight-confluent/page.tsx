import type { Metadata } from "next";
import Link from "next/link";
import { Scale, Stethoscope } from "lucide-react";
import { confluentPairs } from "@/data/eight-confluent";
import { extraVesselMap, meridianMap } from "@/data/meridians";
import { pointMap } from "@/data/points";
import type { View } from "@/data/types";
import { PageHeader } from "@/components/common/page-header";
import { ConfluentPairFigure } from "@/components/figures/diagrams";
import { BodyFigure } from "@/components/figures/body-figure";
import { ProvisionalFigureNotice } from "@/components/common/notices";
import { ReviewStatusBadge } from "@/components/common/badges";
import { SourceList } from "@/components/common/source-list";

export const metadata: Metadata = { title: "八脈交会穴" };

const pairView: Record<string, View> = { "si3-bl62": "back", "te5-gb41": "side", "lu7-ki6": "front", "pc6-sp4": "front" };

export default function EightConfluentPage() {
  return (
    <div>
      <PageHeader
        eyebrow="EIGHT CONFLUENT POINTS"
        title="八脈交会穴"
        description="十二経脈上にありながら奇経八脈に通じる8つの経穴。手の穴と足の穴を上下で組み、2本の奇経が会合する部位の症状に用いるという伝統的な配穴法です。"
      />
      <nav className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="組み合わせ一覧">
        {confluentPairs.map((p) => (
          <a key={p.id} href={`#${p.id}`} className="shrink-0 rounded-full border bg-white px-3 py-2 text-sm hover:border-primary/40">
            {pointMap[p.upper.code].name}＋{pointMap[p.lower.code].name}
          </a>
        ))}
      </nav>

      <div className="space-y-8">
        {confluentPairs.map((pair, idx) => {
          const up = pointMap[pair.upper.code];
          const lo = pointMap[pair.lower.code];
          const vessels = [extraVesselMap[pair.upper.vessel], extraVesselMap[pair.lower.vessel]];
          return (
            <section key={pair.id} id={pair.id} className="scroll-mt-20 rounded-2xl border bg-white p-4 sm:p-6" style={{ borderTop: `4px solid ${pair.color}` }}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-extra">第{idx + 1}組</p>
                  <h2 className="text-xl font-bold">
                    <Link href={`/points/${up.code}`} className="hover:underline">
                      {up.name} <span className="font-mono text-base" style={{ color: meridianMap[up.meridian].color }}>{up.code}</span>
                    </Link>
                    <span className="mx-2 text-muted-foreground">＋</span>
                    <Link href={`/points/${lo.code}`} className="hover:underline">
                      {lo.name} <span className="font-mono text-base" style={{ color: meridianMap[lo.meridian].color }}>{lo.code}</span>
                    </Link>
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {vessels[0].name}＋{vessels[1].name} ／ 主る部位：{pair.regions.join("・")}
                  </p>
                </div>
                <ReviewStatusBadge status={pair.reviewStatus} />
              </div>

              <div className="grid gap-5 lg:grid-cols-[1fr_220px]">
                <div className="space-y-5">
                  <ConfluentPairFigure pair={pair} />

                  <div className="grid gap-3 sm:grid-cols-2">
                    {vessels.map((v) => (
                      <div key={v.id} className="rounded-xl border p-3" style={{ borderColor: `${v.color}40` }}>
                        <p className="text-sm font-bold" style={{ color: v.color }}>
                          {v.name}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">{v.reading}</span>
                        </p>
                        <p className="mt-1 text-xs leading-relaxed">
                          <span className="font-semibold">循行：</span>
                          {v.course}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed">
                          <span className="font-semibold">病候：</span>
                          {v.symptoms.join("、")}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-bold text-primary">この組で扱う症状（伝統的主治）</h3>
                    <ul className="flex flex-wrap gap-1.5">
                      {pair.symptoms.map((s) => (
                        <li key={s} className="rounded-md bg-purple-50 px-2 py-1 text-sm text-extra">
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-bold text-primary">伝統的な配穴の根拠</h3>
                    <ul className="space-y-1.5 text-sm leading-relaxed">
                      {pair.rationale.map((r) => (
                        <li key={r}>・{r}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-xl bg-muted/50 p-3">
                    <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-primary">
                      <Scale className="size-4" />
                      左右の考え方
                    </h3>
                    <ul className="space-y-1.5 text-sm leading-relaxed">
                      {pair.laterality.map((r) => (
                        <li key={r}>・{r}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-xl border border-dashed p-3">
                    <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-primary">
                      <Stethoscope className="size-4" />
                      {pair.clinical.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{pair.clinical.text}</p>
                    <p className="mt-2 text-[11px] text-muted-foreground">教育用の架空例です。</p>
                  </div>
                </div>

                <aside className="space-y-2">
                  <BodyFigure
                    view={pairView[pair.id]}
                    visible={[up.meridian, lo.meridian]}
                    pointCodes={[up.code, lo.code]}
                    className="mx-auto h-80 w-full"
                  />
                  <ProvisionalFigureNotice />
                </aside>
              </div>

              <details className="mt-5 rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-semibold">出典と監修状態</summary>
                <div className="mt-3">
                  <SourceList ids={pair.sourceIds} />
                </div>
              </details>
            </section>
          );
        })}
      </div>
    </div>
  );
}
