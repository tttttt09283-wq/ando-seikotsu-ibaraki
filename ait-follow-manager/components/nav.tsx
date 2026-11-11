"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Home, Menu, MessageSquareText, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "dashboard", label: "ホーム", icon: Home },
  { href: "tasks", label: "タスク", icon: ClipboardList },
  { href: "customers", label: "顧客", icon: Users },
  { href: "templates", label: "テンプレ", icon: MessageSquareText },
  { href: "more", label: "その他", icon: Menu },
] as const;

const MORE_PREFIXES = ["more", "analytics", "settings", "account"];

export function BottomNav({ orgSlug }: { orgSlug: string }) {
  const pathname = usePathname();
  const segment = pathname.split("/")[3] ?? "";
  return (
    <nav
      aria-label="メインメニュー"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-card pb-[env(safe-area-inset-bottom)] md:static md:border-t-0 md:bg-transparent md:pb-0"
    >
      <ul className="mx-auto grid max-w-3xl grid-cols-5 md:flex md:max-w-none md:flex-col md:gap-1">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "more" ? MORE_PREFIXES.includes(segment) : segment === href;
          return (
            <li key={href}>
              <Link
                href={`/o/${orgSlug}/${href}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold text-muted-foreground md:h-11 md:flex-row md:justify-start md:gap-3 md:rounded-md md:px-3 md:text-sm",
                  active && "text-primary md:bg-info-soft",
                )}
              >
                <Icon className="size-6 md:size-5" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
