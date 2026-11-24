import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { authMode, dataMode, lineMessagingConfigured } from "@/lib/config";
import { logoutAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "予約管理", robots: { index: false, follow: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();
  const nav = [
    { href: "/admin", label: "ダッシュボード", ok: true },
    { href: "/admin/reservations", label: "予約検索", ok: true },
    { href: "/admin/calendar", label: "カレンダー", ok: true },
    { href: "/admin/blocks", label: "枠ブロック", ok: hasPermission(admin, "settings") },
    { href: "/admin/settings", label: "場所・メニュー", ok: hasPermission(admin, "settings") },
    { href: "/admin/notifications", label: "通知履歴", ok: true },
    { href: "/admin/audit", label: "監査ログ", ok: hasPermission(admin, "audit") },
    { href: "/admin/export", label: "CSV出力", ok: hasPermission(admin, "export") },
  ].filter((x) => x.ok);
  const warnings = [
    dataMode() === "memory" && "ローカル代替モード（データはこのPCの .data/ に保存）",
    authMode() === "local" && "簡易ログイン（Supabase Auth 未設定）",
    !lineMessagingConfigured() && "LINE Messaging API 未設定（LINE受信は手動照合・通知は手動送信）",
  ].filter(Boolean) as string[];
  return (
    <div className="min-h-dvh bg-stone">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/admin" className="font-serif tracking-[0.14em]">
            予約管理 <span className="text-xs text-mist">岩永拓己 鍼灸</span>
          </Link>
          <form action={logoutAction} className="flex items-center gap-3 text-xs text-mist">
            <span className="hidden sm:inline">{admin.display_name || admin.email}</span>
            <button className="border border-line px-3 py-1.5">ログアウト</button>
          </form>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 pb-2 text-sm">
          {nav.map((x) => (
            <Link key={x.href} href={x.href} className="shrink-0 px-3 py-1.5 text-ink-soft hover:bg-stone">
              {x.label}
            </Link>
          ))}
        </nav>
      </header>
      {warnings.length > 0 && (
        <div className="mx-auto max-w-6xl px-4 pt-3">
          <div className="border border-[#e6d3b0] bg-[#fbf6ec] px-3 py-2 text-xs text-warn">{warnings.join(" ／ ")}</div>
        </div>
      )}
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
