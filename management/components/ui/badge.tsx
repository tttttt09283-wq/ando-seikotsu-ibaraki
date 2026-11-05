import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "bg-stone-100 text-stone-700",
      brand: "bg-brand-100 text-brand-800",
      ok: "bg-green-100 text-green-800",
      warn: "bg-amber-100 text-amber-900",
      danger: "bg-red-100 text-red-800",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
