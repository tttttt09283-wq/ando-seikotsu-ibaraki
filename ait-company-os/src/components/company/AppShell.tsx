"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FlaskConical,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Network,
  ShieldCheck,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DetailPanels } from "./DetailPanels";
import { useCompany } from "./StateProvider";

const NAV = [
  { href: "/", label: "ダッシュボード", short: "ホーム", icon: LayoutDashboard },
  { href: "/chad", label: "CHAD COMMAND", short: "CHAD", icon: MessageSquare },
  { href: "/organization", label: "LIVE COMPANY MAP", short: "組織", icon: Network },
  { href: "/approvals", label: "承認（HUMAN APPROVAL）", short: "承認", icon: ShieldCheck },
] as const;

function DemoBanner() {
  return (
    <div className="bg-demo text-demo-foreground flex items-center justify-center gap-2 px-4 py-1.5 text-center text-xs font-semibold">
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      <span>
        DEMO MODE ― 表示中の成果物・稼働状況・AIコストはすべて<strong className="underline underline-offset-2">デモデータ</strong>です。本番の実績ではありません。
      </span>
    </div>
  );
}

function SafetyBanner() {
  const { snapshot, mutate } = useCompany();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  if (!snapshot.safety.halted) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 bg-red-600 px-4 py-2 text-sm text-white">
      <TriangleAlert className="size-4" aria-hidden />
      <span>
        安全停止中：{snapshot.safety.reason}。AI社員は新しい処理を行いません。
      </span>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          const r = await mutate("/api/system/resume");
          setError(r.ok ? null : r.error);
          setPending(false);
        }}
      >
        確認して再開する
      </Button>
      {error && <span className="w-full text-center text-xs">{error}</span>}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { snapshot, connectionError } = useCompany();
  const pending = snapshot.kpis.pendingApprovals;

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <div className="min-h-dvh">
      <div className="sticky top-0 z-40">
        {snapshot.mode === "demo" && <DemoBanner />}
        <SafetyBanner />
        {connectionError && (
          <div className="flex items-center justify-center gap-2 bg-slate-800 px-4 py-1.5 text-xs text-white">
            <WifiOff className="size-3.5" aria-hidden /> {connectionError}
          </div>
        )}
      </div>

      <div className="mx-auto flex max-w-[1500px]">
        {/* PC：サイドバー */}
        <aside className="sticky top-8 hidden h-[calc(100dvh-2rem)] w-60 shrink-0 flex-col border-r px-3 py-5 lg:flex">
          <Link href="/" className="mb-6 px-3">
            <div className="text-lg font-bold tracking-tight">A.I.T company</div>
            <div className="text-muted-foreground text-xs tracking-[0.2em]">COMPANY OS v0.1</div>
          </Link>
          <nav className="flex flex-col gap-1" aria-label="メインメニュー">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {item.href === "/approvals" && pending > 0 && (
                    <span className="rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">{pending}</span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto space-y-3 px-3">
            <div className="text-muted-foreground text-xs leading-relaxed">
              企業理念
              <div className="text-foreground font-medium">「{snapshot.company.philosophy}」</div>
            </div>
            <Button variant="ghost" size="sm" className="w-full justify-start px-0" onClick={logout}>
              <LogOut aria-hidden /> ログアウト
            </Button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* スマホ：ヘッダー */}
          <header className="flex items-center justify-between border-b px-4 py-3 lg:hidden">
            <div>
              <div className="font-bold tracking-tight">A.I.T company</div>
              <div className="text-muted-foreground text-[10px] tracking-[0.2em]">COMPANY OS v0.1</div>
            </div>
            <Button variant="ghost" size="icon" onClick={logout} aria-label="ログアウト">
              <LogOut />
            </Button>
          </header>
          <main className="px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pb-10">{children}</main>
        </div>
      </div>

      {/* スマホ：下部ナビ */}
      <nav
        className="bg-background/95 fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="メインメニュー"
      >
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-chad font-semibold" : "text-muted-foreground")}
            >
              <item.icon className="size-5" aria-hidden />
              {item.short}
              {item.href === "/approvals" && pending > 0 && (
                <span className="absolute top-1 right-[calc(50%-18px)] rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">{pending}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <DetailPanels />
    </div>
  );
}
