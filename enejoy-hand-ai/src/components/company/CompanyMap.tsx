"use client";

import { ChevronRight } from "lucide-react";
import { COMMANDER_ID, OPERATOR_ID, PRESIDENT_ID } from "@/tenant";
import { formatJpyPrecise, relativeFromNow } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { MemberView } from "@/lib/view";
import { Avatar, StatusChip } from "./MemberParts";
import { useCompany, useNow } from "./StateProvider";

/**
 * 組織図：代表 → 統括責任者 → 司令塔 → チームリーダー → 担当者
 * 状態はすべて保存されたTask・活動記録から算出したもの。
 */

function Node({ m, compact }: { m: MemberView; compact?: boolean }) {
  const { openMember, snapshot } = useCompany();
  const now = useNow(5000);
  const working = ["WORKING", "THINKING", "REVIEWING"].includes(m.status);
  return (
    <button
      type="button"
      onClick={() => openMember(m.id)}
      className={cn(
        "group bg-card relative w-full rounded-xl border p-3 text-left shadow-xs transition hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        working && "border-emerald-400/60 dark:border-emerald-700",
        m.status === "WAITING_APPROVAL" && "border-amber-400/70",
        m.status === "ERROR" && "border-red-400",
        m.status === "STANDBY" && "border-dashed opacity-75",
        m.tier === "commander" && "border-brand/50 bg-gradient-to-br from-[color-mix(in_oklch,var(--brand)_8%,var(--card))] to-card",
      )}
      aria-label={`${m.name}（${m.title}）の詳細`}
    >
      <div className="flex items-start gap-3">
        <Avatar member={m} size={compact ? "sm" : "md"} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-semibold">{m.name}</span>
            {!m.isHuman && <StatusChip status={m.status} />}
          </div>
          <div className="text-muted-foreground truncate text-xs">
            {m.title}
            {!compact && (m.tier === "leader" || m.tier === "staff") && ` ・ ${m.teamName}`}
          </div>
        </div>
        <ChevronRight className="text-muted-foreground mt-1 size-4 opacity-0 transition group-hover:opacity-100" aria-hidden />
      </div>

      {!m.isHuman && (
        <div className="mt-2 space-y-1 text-xs">
          <div className={cn("truncate", m.currentTask ? "text-foreground" : "text-muted-foreground")}>
            {m.currentTask ? `▶ ${m.currentTask.title}` : m.statusDetail}
          </div>
          {!compact && (
            <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
              <span>完了 {m.completedCount}</span>
              <span>最終 {m.lastActiveAt ? relativeFromNow(m.lastActiveAt, now) : "—"}</span>
              <span>
                {formatJpyPrecise(m.usage.costJpy)}
                {snapshot.mode === "demo" && "（推定）"}
              </span>
            </div>
          )}
        </div>
      )}
      {m.isHuman && <div className="text-muted-foreground mt-2 text-xs">{m.statusDetail}</div>}
    </button>
  );
}

function Connector() {
  return <div aria-hidden className="bg-border mx-auto h-4 w-px" />;
}

export function CompanyMap({ compact = false }: { compact?: boolean }) {
  const { snapshot } = useCompany();
  const byId = new Map(snapshot.members.map((m) => [m.id, m]));
  const president = byId.get(PRESIDENT_ID)!;
  const operator = byId.get(OPERATOR_ID)!;
  const commander = byId.get(COMMANDER_ID)!;
  const leaders = snapshot.members.filter((m) => m.tier === "leader");

  return (
    <div className="space-y-0">
      <div className="mx-auto grid max-w-xl gap-0">
        <Node m={president} compact={compact} />
        <Connector />
        <Node m={operator} compact={compact} />
        <Connector />
        <Node m={commander} compact={compact} />
      </div>
      <Connector />
      <div className="border-border mx-[25%] hidden h-px border-t md:block" aria-hidden />
      <div className="grid gap-4 md:grid-cols-2">
        {leaders.map((leader) => {
          const staff = snapshot.members.filter((m) => m.reportsTo === leader.id);
          return (
            <section key={leader.id} aria-label={leader.teamName} className="min-w-0">
              <div className="hidden md:block">
                <Connector />
              </div>
              <div className="text-muted-foreground mb-1.5 text-center text-[11px] font-medium tracking-wider">{leader.teamName}</div>
              <Node m={leader} compact={compact} />
              <div className="border-border mt-2 ml-4 space-y-2 border-l pl-3">
                {staff.map((s) => (
                  <Node key={s.id} m={s} compact={compact} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function StatusLegend() {
  const items: MemberView["status"][] = ["IDLE", "THINKING", "WORKING", "REVIEWING", "WAITING_APPROVAL", "STANDBY", "ERROR"];
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <StatusChip key={s} status={s} />
      ))}
    </div>
  );
}
