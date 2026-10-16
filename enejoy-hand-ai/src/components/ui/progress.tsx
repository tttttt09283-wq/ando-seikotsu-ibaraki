import { cn } from "@/lib/utils";

function Progress({
  value,
  className,
  indicatorClassName,
  "aria-label": ariaLabel,
}: {
  value: number;
  className?: string;
  indicatorClassName?: string;
  "aria-label"?: string;
}) {
  const v = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      aria-label={ariaLabel}
      className={cn("bg-secondary relative h-2 w-full overflow-hidden rounded-full", className)}
    >
      <div className={cn("bg-brand h-full rounded-full transition-all duration-500", indicatorClassName)} style={{ width: `${v}%` }} />
    </div>
  );
}

export { Progress };
