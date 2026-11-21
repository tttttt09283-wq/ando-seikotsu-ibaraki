import { AlertTriangle, Lightbulb } from "lucide-react";
import type { ContentBlock } from "@/data/types";
import { FigureRenderer } from "@/components/figures/figure-renderer";

export function ContentBlockView({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "keypoint":
      return (
        <section className="rounded-xl border border-primary/15 bg-accent/60 p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-primary">
            <Lightbulb className="size-4" />
            {block.title}
          </h3>
          <ul className="space-y-1.5 text-[15px] leading-relaxed">
            {block.items?.map((i) => (
              <li key={i} className="font-medium">
                {i}
              </li>
            ))}
          </ul>
        </section>
      );
    case "caution":
      return (
        <section className="rounded-xl border border-warn/25 bg-red-50 p-4">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-warn">
            <AlertTriangle className="size-4" />
            {block.title}
          </h3>
          <p className="text-sm leading-relaxed">{block.body}</p>
        </section>
      );
    case "list":
      return (
        <section>
          <h3 className="mb-2 text-base font-bold text-primary">{block.title}</h3>
          <ul className="space-y-2">
            {block.items?.map((i) => {
              const [head, ...rest] = i.split("：");
              return (
                <li key={i} className="flex gap-2 text-[15px] leading-relaxed">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" />
                  <span>
                    {rest.length ? (
                      <>
                        <span className="font-semibold">{head}</span>
                        <span className="text-muted-foreground">：{rest.join("：")}</span>
                      </>
                    ) : (
                      i
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      );
    case "compare":
      return (
        <section>
          <h3 className="mb-3 text-base font-bold text-primary">{block.title}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {block.columns?.map((c, idx) => (
              <div key={c.heading} className={idx === 0 ? "rounded-xl border-2 border-meridian/30 bg-white p-4" : "rounded-xl border-2 border-slate-300 bg-white p-4"}>
                <p className={idx === 0 ? "mb-2 text-sm font-bold text-meridian" : "mb-2 text-sm font-bold text-slate-600"}>{c.heading}</p>
                <ul className="space-y-1.5 text-sm leading-relaxed">
                  {c.items.map((i) => (
                    <li key={i}>・{i}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      );
    case "figure":
      return (
        <figure className="rounded-xl border bg-white p-4">
          {block.title && <h3 className="mb-3 text-base font-bold text-primary">{block.title}</h3>}
          {block.figureId && <FigureRenderer id={block.figureId} />}
          {block.caption && <figcaption className="mt-3 text-sm leading-relaxed text-muted-foreground">{block.caption}</figcaption>}
        </figure>
      );
    default:
      return (
        <section>
          {block.title && <h3 className="mb-2 text-base font-bold text-primary">{block.title}</h3>}
          <p className="text-[15px] leading-loose">{block.body}</p>
        </section>
      );
  }
}
