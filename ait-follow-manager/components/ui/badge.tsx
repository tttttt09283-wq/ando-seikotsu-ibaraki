import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", {
  variants: {
    variant: {
      default: "bg-info-soft text-primary",
      navy: "bg-navy text-navy-foreground",
      danger: "bg-danger-soft text-danger",
      warning: "bg-warning-soft text-warning",
      success: "bg-success-soft text-success",
      muted: "bg-muted text-muted-foreground",
      outline: "border text-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
