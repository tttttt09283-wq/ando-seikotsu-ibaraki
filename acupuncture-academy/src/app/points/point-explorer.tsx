"use client";

import * as React from "react";
import Link from "next/link";
import { Search, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { points } from "@/data/points";
import { meridianMap, meridians } from "@/data/meridians";
import type { MeridianId, PointCategory } from "@/data/types";
import { useLearning } from "@/lib/learning-store";
import { FavoriteButton } from "@/components/points/favorite-button";
import { ReviewStatusBadge } from "@/components/common/badges";

const categories: PointCategory[] = ["八脈交会穴", "絡穴", "五兪穴", "四総穴", "原穴", "郄穴", "背部兪穴", "募穴", "八会穴", "下合穴"];

function Chip({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-xs whitespace-nowrap transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-white text-foreground hover:border-primary/40",
      )}
      style={active && color ? { background: color, borderColor: color } : undefined}
    >
      {children}
    </button>
  );
}

export function PointExplorer() {
  const { state } = useLearning();
  const [q, setQ] = React.useState("");
  const [meridian, setMeridian] = React.useState<MeridianId | "all">("all");
  const [category, setCategory] = React.useState<PointCategory | "all">("all");
  const [favOnly, setFavOnly] = React.useState(false);

  const counts = React.useMemo(() => {
    const c: Partial<Record<MeridianId, number>> = {};
    for (const p of points) c[p.meridian] = (c[p.meridian] ?? 0) + 1;
    return c;
  }, []);

  const filtered = points.filter((p) => {
    const text = `${p.name}${p.reading}${p.code}${meridianMap[p.meridian].name}${p.indications.map((i) => i.text).join("")}`.toLowerCase();
    if (q && !text.includes(q.trim().toLowerCase())) return false;
    if (meridian !== "all" && p.meridian !== meridian) return false;
    if (category !== "all" && !p.categories.some((c) => c.category === category)) return false;
    if (favOnly && !state.favorites.includes(p.code)) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="経穴名・よみ・コード・主治で検索（例：内関、PC6、咽喉）" className="h-12 pl-9" aria-label="経穴を検索" />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">経絡別</p>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          <Chip active={meridian === "all"} onClick={() => setMeridian("all")}>
            すべて
          </Chip>
          {meridians.map((m) => (
            <Chip key={m.id} active={meridian === m.id} onClick={() => setMeridian(m.id)} color={m.color}>
              {m.short}
              {counts[m.id] ? `（${counts[m.id]}）` : ""}
            </Chip>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">要穴別</p>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          <Chip active={category === "all"} onClick={() => setCategory("all")}>
            すべて
          </Chip>
          {categories.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {c}
            </Chip>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{filtered.length}件</p>
        <Chip active={favOnly} onClick={() => setFavOnly((v) => !v)}>
          <span className="flex items-center gap-1">
            <Star className={cn("size-3.5", favOnly && "fill-current")} />
            お気に入りのみ（{state.favorites.length}）
          </span>
        </Chip>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          条件に合う経穴がありません。収録は順次追加予定です（初期版は八脈交会穴8穴）。
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const m = meridianMap[p.meridian];
            return (
              <li key={p.code}>
                <Link href={`/points/${p.code}`} className="flex h-full flex-col gap-2 rounded-xl border bg-white p-4 transition-colors hover:border-primary/40" style={{ borderLeft: `4px solid ${m.color}` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-bold">
                        {p.name}
                        <span className="ml-2 font-mono text-sm" style={{ color: m.color }}>
                          {p.code}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.reading}・{m.name}
                      </p>
                    </div>
                    <FavoriteButton code={p.code} compact />
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{p.location}</p>
                  <div className="mt-auto flex flex-wrap gap-1">
                    {p.categories.map((c) => (
                      <Badge key={c.category} variant={c.category === "八脈交会穴" ? "extra" : "key"}>
                        {c.category}
                      </Badge>
                    ))}
                    <ReviewStatusBadge status={p.reviewStatus} short />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
