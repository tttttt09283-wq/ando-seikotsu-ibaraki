"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { v: "light", label: "ライト", Icon: Sun },
  { v: "dark", label: "ダーク", Icon: Moon },
  { v: "system", label: "端末に合わせる", Icon: Monitor },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className={cn("inline-flex rounded-lg border border-white/10 p-0.5", className)} role="radiogroup" aria-label="表示テーマ">
      {OPTIONS.map(({ v, label, Icon }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={mounted && theme === v}
          title={label}
          onClick={() => setTheme(v)}
          className={cn("rounded-md p-1.5 opacity-70 hover:opacity-100", mounted && theme === v && "bg-white/15 opacity-100")}
        >
          <Icon className="size-4" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
