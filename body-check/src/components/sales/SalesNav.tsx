"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export const SALES_PAGES = [
  { href: "/for-clinics", label: "概要・料金", icon: "🏠" },
  { href: "/demo", label: "デモを試す", icon: "📱" },
  { href: "/for-clinics/flow", label: "活用手順", icon: "🗺️" },
  { href: "/for-clinics/guide", label: "導入ガイド", icon: "🛠️" },
  { href: "/for-clinics/sns", label: "SNS投稿文", icon: "💬" },
  { href: "/for-clinics/templates", label: "店頭テンプレート", icon: "🖨️" },
] as const;

export function SalesNav() {
  const path = usePathname();
  return (
    <nav aria-label="販売ページのメニュー" className="no-print -mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2 whitespace-nowrap">
        {SALES_PAGES.map((p) => {
          const on = p.href === path;
          return (
            <li key={p.href}>
              <Link
                href={p.href}
                aria-current={on ? "page" : undefined}
                className={cx(
                  "inline-flex items-center gap-1 rounded-full border-2 px-3 py-1.5 text-sm font-bold",
                  on ? "border-white bg-white text-brand-700" : "border-white/40 text-white hover:bg-white/10",
                )}
              >
                <span aria-hidden="true">{p.icon}</span>
                {p.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
