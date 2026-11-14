"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { BOTTOM, NAV, isActive } from "./nav-items";
import { signOutAction } from "@/app/(auth)/actions";

export function AppShell({ children, mode, email }: { children: React.ReactNode; mode: "supabase" | "local"; email: string }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-dvh lg:pl-64">
      {/* PC：左サイドバー */}
      <aside className="bg-sidebar text-sidebar-foreground fixed inset-y-0 left-0 z-30 hidden w-64 flex-col lg:flex">
        <Link href="/" className="flex items-center gap-2.5 px-5 pt-6 pb-5">
          <Logo />
          <div>
            <div className="text-[15px] font-bold tracking-wide text-white">FREEDOM OS</div>
            <div className="text-[11px] text-white/55">AI × 鍼灸・整体 独立管理</div>
          </div>
        </Link>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {NAV.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                isActive(pathname, href) ? "bg-white/10 font-semibold text-white" : "text-white/70 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className={cn("size-[18px]", isActive(pathname, href) && "text-primary")} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="space-y-3 border-t border-white/10 p-4 text-xs text-white/60">
          <div className="flex items-center justify-between">
            <span>表示</span>
            <ThemeToggle />
          </div>
          <div className="truncate" title={email}>
            {mode === "local" ? "ローカルモード（開発用）" : email}
          </div>
          {mode === "supabase" && (
            <form action={signOutAction}>
              <button className="flex items-center gap-2 text-white/70 hover:text-white" type="submit">
                <LogOut className="size-4" /> ログアウト
              </button>
            </form>
          )}
        </div>
      </aside>

      {/* スマホ：上部バー */}
      <header className="bg-sidebar text-sidebar-foreground sticky top-0 z-30 flex items-center justify-between px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <Logo small />
          <span className="text-sm font-bold tracking-wide text-white">FREEDOM OS</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pt-4 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12">{children}</main>

      {/* スマホ：下部ナビ */}
      <nav className="bg-background/95 fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="メインメニュー">
        <div className="grid grid-cols-5">
          {NAV.filter((n) => BOTTOM.includes(n.href)).map(({ href, short, Icon }) => (
            <Link key={href} href={href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", isActive(pathname, href) ? "text-primary font-semibold" : "text-muted-foreground")}>
              <Icon className="size-5" />
              {short}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", !NAV.some((n) => BOTTOM.includes(n.href) && isActive(pathname, n.href)) ? "text-primary font-semibold" : "text-muted-foreground")}
          >
            <Menu className="size-5" />
            メニュー
          </button>
        </div>
      </nav>
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent>
          <DialogTitle>メニュー</DialogTitle>
          <div className="grid grid-cols-3 gap-2">
            {NAV.map(({ href, short, Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={cn("flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs", isActive(pathname, href) ? "border-primary text-primary" : "")}
              >
                <Icon className="size-5" />
                {short}
              </Link>
            ))}
          </div>
          <div className="text-muted-foreground flex items-center justify-between text-xs">
            <span className="truncate">{mode === "local" ? "ローカルモード（開発用）" : email}</span>
            {mode === "supabase" && (
              <form action={signOutAction}>
                <button className="flex items-center gap-1" type="submit">
                  <LogOut className="size-4" /> ログアウト
                </button>
              </form>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Logo({ small }: { small?: boolean }) {
  const s = small ? 22 : 30;
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="14" fill="#0b1220" stroke="rgba(255,255,255,.12)" />
      <g fill="#2fbf8f">
        {[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={14 + c * 13} y={14 + r * 13} width="10" height="10" rx="2" opacity={r === c ? 1 : 0.55} />))}
      </g>
    </svg>
  );
}
