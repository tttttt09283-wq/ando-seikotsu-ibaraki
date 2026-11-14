import { CalendarCheck, Calculator, ChartGantt, Grid3x3, LayoutDashboard, ListChecks, Settings, ShieldCheck, Sparkles, Wallet } from "lucide-react";

export const NAV = [
  { href: "/", label: "ダッシュボード", short: "ホーム", Icon: LayoutDashboard },
  { href: "/mandala", label: "マンダラ", short: "マンダラ", Icon: Grid3x3 },
  { href: "/tasks", label: "タスク", short: "タスク", Icon: ListChecks },
  { href: "/simulator", label: "収益シミュレーター", short: "試算", Icon: Calculator },
  { href: "/actuals", label: "月次実績", short: "実績", Icon: Wallet },
  { href: "/roadmap", label: "ロードマップ", short: "ロードマップ", Icon: ChartGantt },
  { href: "/independence", label: "独立判定", short: "独立判定", Icon: ShieldCheck },
  { href: "/review", label: "週間レビュー", short: "レビュー", Icon: CalendarCheck },
  { href: "/advisor", label: "AI経営参謀", short: "AI参謀", Icon: Sparkles },
  { href: "/settings", label: "設定・データ", short: "設定", Icon: Settings },
] as const;

/** スマホ下部ナビに常に出す4つ（残りは「メニュー」から） */
export const BOTTOM = ["/", "/mandala", "/tasks", "/actuals"];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}
