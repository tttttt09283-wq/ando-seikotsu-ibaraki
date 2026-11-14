import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { ActionStatus } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/domain/mandala";
import type { CriterionStatus } from "@/lib/domain/criteria";
import { CRITERION_STATUS_LABEL } from "@/lib/domain/criteria";
import { CircleCheck, CircleX, Clock, Info, TriangleExclamationPoint } from "lucide-react";

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** 実績／試算／目標の区別ラベル */
export function SourceTag({ kind, className }: { kind: "actual" | "sim" | "target" | "calc"; className?: string }) {
  const map = {
    actual: { label: "実績", cls: "bg-status-green/15 text-status-green" },
    sim: { label: "試算", cls: "bg-status-amber/20 text-status-amber" },
    target: { label: "目標", cls: "bg-status-blue/15 text-status-blue" },
    calc: { label: "計算", cls: "bg-muted text-muted-foreground" },
  }[kind];
  return <span className={cn("inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none", map.cls, className)}>{map.label}</span>;
}

export function Kpi({
  label,
  value,
  sub,
  tag,
  tone,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tag?: "actual" | "sim" | "target" | "calc";
  tone?: "good" | "bad" | "neutral";
  className?: string;
}) {
  return (
    <div className={cn("bg-card rounded-xl border p-4 shadow-sm", className)}>
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        <span className="truncate">{label}</span>
        {tag && <SourceTag kind={tag} />}
      </div>
      <div className={cn("num mt-1.5 text-xl font-bold tracking-tight sm:text-2xl", tone === "good" && "text-status-green", tone === "bad" && "text-status-red")}>{value}</div>
      {sub && <div className="text-muted-foreground mt-1 text-xs">{sub}</div>}
    </div>
  );
}

const STATUS_VARIANT: Record<ActionStatus, "gray" | "blue" | "green" | "red"> = { not_started: "gray", in_progress: "blue", achieved: "green", missed: "red" };
export const STATUS_CELL: Record<ActionStatus, string> = {
  not_started: "border-status-gray/30 bg-status-gray/5",
  in_progress: "border-status-blue/50 bg-status-blue/10",
  achieved: "border-status-green/60 bg-status-green/15",
  missed: "border-status-red/60 bg-status-red/10",
};
export const STATUS_BAR: Record<ActionStatus, string> = { not_started: "bg-status-gray", in_progress: "bg-status-blue", achieved: "bg-status-green", missed: "bg-status-red" };

export function StatusBadge({ status, className }: { status: ActionStatus; className?: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className={className}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

const CRIT: Record<CriterionStatus, { variant: "green" | "red" | "gray" | "amber"; Icon: typeof CircleCheck }> = {
  achieved: { variant: "green", Icon: CircleCheck },
  not_achieved: { variant: "red", Icon: CircleX },
  insufficient: { variant: "gray", Icon: Info },
  needs_review: { variant: "amber", Icon: TriangleExclamationPoint },
};
export function CriterionBadge({ status }: { status: CriterionStatus }) {
  const c = CRIT[status];
  return (
    <Badge variant={c.variant}>
      <c.Icon /> {CRITERION_STATUS_LABEL[status]}
    </Badge>
  );
}

export function SimNote({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-status-amber flex items-start gap-1.5 text-xs", className)}>
      <Clock className="mt-0.5 size-3.5 shrink-0" />
      <span>{children ?? "仮定に基づく試算です。実際の結果を保証するものではありません。"}</span>
    </p>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">{children}</div>;
}
