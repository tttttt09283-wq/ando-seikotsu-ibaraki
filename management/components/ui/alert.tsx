import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  info: "border-sky-200 bg-sky-50 text-sky-900",
  ok: "border-green-200 bg-green-50 text-green-900",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-900",
};

export function Alert({ tone = "info", className, ...props }: React.HTMLAttributes<HTMLDivElement> & { tone?: keyof typeof tones }) {
  return <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-lg border px-3 py-2 text-sm leading-relaxed", tones[tone], className)} {...props} />;
}
