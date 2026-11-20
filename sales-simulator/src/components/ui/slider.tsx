"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

export function Slider({
  className,
  rangeClassName,
  thumbClassName,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & { rangeClassName?: string; thumbClassName?: string }) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        "relative flex w-full touch-none select-none items-center py-2 data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-slate-200">
        <SliderPrimitive.Range className={cn("absolute h-full bg-navy-700", rangeClassName)} />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className={cn(
          "block size-6 rounded-full border-2 border-navy-700 bg-white shadow transition-shadow outline-none focus-visible:ring-4 focus-visible:ring-navy-500/25 sm:size-5",
          thumbClassName,
        )}
      />
    </SliderPrimitive.Root>
  );
}
