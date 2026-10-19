"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, CalendarDays, FileUp, LayoutDashboard, ListOrdered, Settings, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/", label: "ダッシュボード", short: "ホーム", icon: LayoutDashboard, mobile: true },
  { href: "/transactions", label: "入出金一覧", short: "入出金", icon: ListOrdered, mobile: true },
  { href: "/calendar", label: "予定カレンダー", short: "予定", icon: CalendarDays, mobile: false },
  { href: "/forecast", label: "資金予測", short: "予測", icon: TrendingUp, mobile: true },
  { href: "/import", label: "CSV取込", short: "取込", icon: FileUp, mobile: true },
  { href: "/assistant", label: "AI分析", short: "AI", icon: Bot, mobile: false },
  { href: "/settings", label: "店舗・口座・ユーザー", short: "設定", icon: Settings, mobile: true },
] as const;

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export function SideNav() {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="メインメニュー">
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-current={isActive(path, n.href) ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
            isActive(path, n.href) ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <n.icon className="size-4" aria-hidden />
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  const items = NAV.filter((n) => n.mobile);
  return (
    <nav className="bg-background/95 fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="メインメニュー">
      {items.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-current={isActive(path, n.href) ? "page" : undefined}
          className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", isActive(path, n.href) ? "text-brand font-semibold" : "text-muted-foreground")}
        >
          <n.icon className="size-5" aria-hidden />
          {n.short}
        </Link>
      ))}
    </nav>
  );
}
