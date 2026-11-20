import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus-visible:border-navy-500 focus-visible:ring-2 focus-visible:ring-navy-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}
