"use client";
import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function Progress({ className, value, indicatorClassName, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <ProgressPrimitive.Root data-slot="progress" className={cn("bg-muted relative h-2 w-full overflow-hidden rounded-full", className)} value={v} {...props}>
      <ProgressPrimitive.Indicator data-slot="progress-indicator" className={cn("bg-primary h-full w-full flex-1 transition-all", indicatorClassName)} style={{ transform: `translateX(-${100 - v}%)` }} />
    </ProgressPrimitive.Root>
  );
}
export { Progress };
