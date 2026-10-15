"use client";

import { Crown, Sparkles } from "lucide-react";
import type { MemberView } from "@/lib/view";
import { cn } from "@/lib/utils";
import { AGENT_STATUS_META } from "./labels";

export function StatusDot({ status, className }: { status: MemberView["status"]; className?: string }) {
  const meta = AGENT_STATUS_META[status];
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", meta.dot, meta.live && "status-live", className)}
    />
  );
}

export function StatusChip({ status, className }: { status: MemberView["status"]; className?: string }) {
  const meta = AGENT_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide",
        meta.chip,
        className,
      )}
    >
      <StatusDot status={status} className="size-1.5" />
      {meta.label}
    </span>
  );
}

const TIER_AVATAR: Record<MemberView["tier"], string> = {
  ceo: "bg-primary text-primary-foreground",
  chad: "bg-chad text-chad-foreground",
  executive: "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900",
  manager: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
  staff: "bg-secondary text-secondary-foreground",
};

export function Avatar({ member, size = "md" }: { member: MemberView; size?: "sm" | "md" | "lg" }) {
  const dim = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg" }[size];
  const initial = member.id === "chad" ? null : member.name.replace(/\s/g, "").slice(0, 1);
  return (
    <span className={cn("relative grid shrink-0 place-items-center rounded-full font-bold", dim, TIER_AVATAR[member.tier])}>
      {member.id === "chad" ? <Sparkles className="size-1/2" aria-hidden /> : member.tier === "ceo" ? <Crown className="size-1/2" aria-hidden /> : initial}
      {!member.isHuman && (
        <StatusDot status={member.status} className="ring-background absolute -right-0.5 -bottom-0.5 size-3 ring-2" />
      )}
    </span>
  );
}
