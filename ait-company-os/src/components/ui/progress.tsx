import { cn } from "@/lib/utils";

function Progress({ value, className, indicatorClassName }: { value: number; className?: string; indicatorClassName?: string }) {
  const v = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      className={cn("bg-secondary relative h-2 w-full overflow-hidden rounded-full", className)}
    >
      <div className={cn("bg-chad h-full rounded-full transition-all duration-500", indicatorClassName)} style={{ width: `${v}%` }} />
    </div>
  );
}

export { Progress };
