"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useLearning } from "@/lib/learning-store";
import { updatedSinceSeen } from "@/lib/stats";
import { lessonRevision } from "@/data/changelog";

/** 学習済みの講義のうち、前回の確認後に更新されたもの */
export function UpdatedForYou({ compact = false }: { compact?: boolean }) {
  const { state, hydrated } = useLearning();
  if (!hydrated) return null;
  const list = updatedSinceSeen(state);
  if (!list.length) return compact ? null : <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">あなたが学習した講義は、すべて最新の版を確認済みです。</p>;
  return (
    <section className="rounded-xl border border-primary/25 bg-accent/50 p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-primary">
        <RefreshCw className="size-4" />
        学習した講義のうち {list.length} 講が更新されています
      </h2>
      <ul className="space-y-1.5 text-sm">
        {list.map((l) => (
          <li key={l.id}>
            <Link href={`/lessons/${l.id}`} className="font-semibold text-primary underline">
              {l.title}
            </Link>
            <span className="ml-2 text-muted-foreground">{lessonRevision(l.id).note}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
