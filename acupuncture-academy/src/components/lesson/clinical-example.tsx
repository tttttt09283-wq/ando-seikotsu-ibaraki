import { ShieldAlert } from "lucide-react";
import type { ClinicalExample } from "@/data/types";
import { FictionalCaseNotice } from "@/components/common/notices";

export function ClinicalExampleView({ example }: { example: ClinicalExample }) {
  return (
    <div className="space-y-5">
      <FictionalCaseNotice text={example.fictionalNotice} />
      <section className="rounded-xl border bg-white p-4">
        <h3 className="mb-2 text-base font-bold text-primary">{example.title}</h3>
        <ul className="space-y-1.5 text-[15px] leading-relaxed">
          {example.presentation.map((p) => (
            <li key={p}>・{p}</li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border border-warn/25 bg-red-50 p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-warn">
          <ShieldAlert className="size-4" />
          まず確認する危険徴候（すべて「なし」を確認してから施術を検討）
        </h3>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {example.redFlagCheck.map((r) => (
            <li key={r}>□ {r}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-3 text-base font-bold text-primary">経絡で考える手順</h3>
        <ol className="relative space-y-4 border-l-2 border-primary/20 pl-5">
          {example.reasoning.map((r) => (
            <li key={r.step} className="relative">
              <span className="absolute top-1.5 -left-[27px] size-3 rounded-full border-2 border-primary bg-white" />
              <p className="text-sm font-bold">{r.step}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{r.detail}</p>
            </li>
          ))}
        </ol>
      </section>
      <p className="rounded-xl bg-primary p-4 text-sm leading-relaxed text-primary-foreground">{example.takeaway}</p>
    </div>
  );
}
