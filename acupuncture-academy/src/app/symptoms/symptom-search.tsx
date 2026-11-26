"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { symptomGuides } from "@/data/symptoms";
import { pointMap } from "@/data/points";

function score(q: string, g: (typeof symptomGuides)[number]) {
  if (!q) return 1;
  const s = q.trim().toLowerCase();
  if (g.name.includes(s)) return 4;
  if (g.aliases.some((a) => a.includes(s) || s.includes(a))) return 3;
  if (g.patterns.some((p) => p.name.includes(s) || p.signs.some((x) => x.includes(s)))) return 2;
  const codes = [...(g.regions ?? []).flatMap((r) => [...r.local, ...r.distal]), ...g.common.map((c) => c.rec), ...g.patterns.flatMap((p) => p.points)].map((x) => x.code);
  if (codes.some((c) => c.toLowerCase() === s || pointMap[c]?.name === q.trim())) return 1;
  return 0;
}

export function SymptomSearch() {
  const [q, setQ] = React.useState("");
  const list = symptomGuides
    .map((g) => ({ g, s: score(q, g) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  const groups = [...new Set(symptomGuides.map((g) => g.group))];

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="症状で検索（例：頭痛、肩こり、眠れない、生理痛、胃もたれ）"
          className="h-12 pl-9"
          aria-label="症状を検索"
        />
      </div>
      {q ? (
        list.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {list.map(({ g }) => (
              <Row key={g.id} g={g} />
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
            「{q}」に合う症状のガイドはまだありません。別の言い方（例：「首」「腰」「胃」）で探してみてください。
          </p>
        )
      ) : (
        groups.map((gr) => (
          <section key={gr}>
            <h2 className="mb-2 text-xs font-semibold text-muted-foreground">{gr}</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {symptomGuides
                .filter((g) => g.group === gr)
                .map((g) => (
                  <Row key={g.id} g={g} />
                ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function Row({ g }: { g: (typeof symptomGuides)[number] }) {
  return (
    <li>
      <Link href={`/symptoms/${g.id}`} className="flex items-center gap-3 rounded-xl border bg-white p-4 hover:border-primary/40">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{g.name}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">証の候補：{g.patterns.map((p) => p.name).join("・")}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}
