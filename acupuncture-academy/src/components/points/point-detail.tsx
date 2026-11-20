import Link from "next/link";
import { AlertTriangle, MapPin, Network } from "lucide-react";
import type { AcuPoint, KnowledgeKind } from "@/data/types";
import { meridianMap, extraVesselMap } from "@/data/meridians";
import { pointMap } from "@/data/points";
import { Badge } from "@/components/ui/badge";
import { KindBadge, ReviewStatusBadge, kindLabel } from "@/components/common/badges";
import { SourceList } from "@/components/common/source-list";
import { FavoriteButton } from "./favorite-button";

const kindOrder: KnowledgeKind[] = ["traditional", "modern", "research"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-bold text-primary">{title}</h3>
      {children}
    </section>
  );
}

export function PointDetail({ point, headingLevel = "h1" }: { point: AcuPoint; headingLevel?: "h1" | "h2" }) {
  const m = meridianMap[point.meridian];
  const H = headingLevel;
  const ev = point.extraVessel ? extraVesselMap[point.extraVessel] : null;
  return (
    <article className="space-y-6">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold" style={{ color: m.color }}>
              {m.name}
            </p>
            <H className="mt-1 text-2xl font-bold tracking-tight text-foreground">
              {point.name}
              <span className="ml-2 text-base font-medium text-muted-foreground">{point.reading}</span>
            </H>
            <p className="mt-1 font-mono text-sm font-semibold" style={{ color: m.color }}>
              WHO: {point.code}
            </p>
          </div>
          <FavoriteButton code={point.code} compact />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {point.categories.map((c) => (
            <Badge key={c.category + c.detail} variant={c.category === "八脈交会穴" ? "extra" : "key"}>
              {c.category}：{c.detail}
            </Badge>
          ))}
          <ReviewStatusBadge status={point.reviewStatus} />
        </div>
      </header>

      <Section title="位置">
        <p className="flex gap-2 rounded-lg border bg-white p-3 text-[15px] leading-relaxed">
          <MapPin className="mt-1 size-4 shrink-0 text-primary" />
          {point.location}
        </p>
      </Section>

      <Section title="取穴方法">
        <ol className="space-y-1.5 text-sm leading-relaxed">
          {point.howToLocate.map((h, i) => (
            <li key={h} className="flex gap-2">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[10px] font-bold text-primary">{i + 1}</span>
              {h}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="局所解剖（現代医学）">
        <dl className="grid gap-px overflow-hidden rounded-lg border bg-border text-sm">
          {point.anatomy.map((a) => (
            <div key={a.label} className="grid grid-cols-[5.5rem_1fr] bg-white">
              <dt className="bg-muted/60 px-3 py-2 text-xs font-semibold text-muted-foreground">{a.label}</dt>
              <dd className="px-3 py-2">{a.text}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-verify">局所解剖は個体差があります。解剖学教科書での照合前（要確認）。</p>
      </Section>

      {ev && (
        <Section title="八脈交会穴としての位置づけ">
          <div className="flex gap-3 rounded-lg border border-extra/25 bg-purple-50/60 p-3 text-sm">
            <Network className="mt-0.5 size-4 shrink-0 text-extra" />
            <p>
              <span className="font-semibold text-extra">{ev.name}</span>に通じる穴。{ev.course}
              <Link href="/eight-confluent" className="ml-1 font-semibold text-primary underline">
                組み合わせを見る
              </Link>
            </p>
          </div>
        </Section>
      )}

      <Section title="伝統的な作用">
        <ul className="flex flex-wrap gap-1.5">
          {point.actions.map((a) => (
            <li key={a} className="rounded-md bg-secondary px-2 py-1 text-sm text-secondary-foreground">
              {a}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="主治（区分別）">
        <div className="space-y-3">
          {kindOrder.map((k) => {
            const items = point.indications.filter((i) => i.kind === k);
            return (
              <div key={k} className="rounded-lg border bg-white p-3">
                <div className="mb-2 flex items-center gap-2">
                  <KindBadge kind={k} />
                </div>
                {items.length ? (
                  <ul className="space-y-1 text-sm">
                    {items.map((i) => (
                      <li key={i.text} className="flex items-start justify-between gap-2">
                        <span>・{i.text}</span>
                        {i.reviewStatus !== "verified" && <span className="shrink-0 text-[10px] text-verify">要確認</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {k === "research" ? "本アプリに登録された臨床研究エビデンスはまだありません。" : `${kindLabel[k]}の記載は未登録です。`}
                  </p>
                )}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">伝統的主治は古典・教科書に基づく伝統理論上の記載であり、効果が臨床研究で証明されていることを意味しません。</p>
        </div>
      </Section>

      <Section title="関連経穴">
        <ul className="grid gap-2 sm:grid-cols-2">
          {point.related.map((r) => {
            const inDict = pointMap[r.code];
            const inner = (
              <>
                <span className="font-semibold">
                  {r.name} <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
                </span>
                <span className="block text-xs text-muted-foreground">{r.reason}</span>
                {!inDict && <span className="mt-1 block text-[10px] text-muted-foreground">（辞典は今後追加予定）</span>}
              </>
            );
            return (
              <li key={r.code}>
                {inDict ? (
                  <Link href={`/points/${r.code}`} className="block rounded-lg border bg-white p-3 text-sm hover:border-primary/40">
                    {inner}
                  </Link>
                ) : (
                  <div className="rounded-lg border bg-white p-3 text-sm">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="配穴例">
        <ul className="space-y-2">
          {point.combinations.map((c) => (
            <li key={c.points} className="rounded-lg border bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{c.points}</span>
                <KindBadge kind={c.kind} />
              </div>
              <p className="mt-1 text-muted-foreground">{c.purpose}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="安全上の注意">
        <ul className="space-y-1.5 rounded-lg border border-warn/25 bg-red-50 p-3 text-sm">
          {point.safety.map((s) => (
            <li key={s} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
              {s}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="出典と監修状態">
        <SourceList ids={[...point.sourceIds, ...point.indications.flatMap((i) => i.sourceIds)]} />
      </Section>
    </article>
  );
}
