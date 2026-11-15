import Link from "next/link";
import { logout } from "@/app/actions";
import { canAdmin, canSeeReviewQueue, effectivePositions, hasDormantPrivilege, type Actor } from "@/lib/authz";
import { clinicName, POSITION_LABEL } from "@/lib/config";
import { sql } from "@/lib/db";

// 画面の枠：上に名前、スマホは下にタブ、PCは左にメニュー
export async function Shell({ actor, active, children }: { actor: Actor; active: string; children: React.ReactNode }) {
  const [{ n }] = await sql()`select count(*)::int as n from mn_notifications where member_id = ${actor.memberId} and read_at is null`;
  const tabs = [
    { href: "/", key: "home", label: "ホーム", icon: "⌂" },
    { href: "/rules", key: "rules", label: "ルール", icon: "§" },
    { href: "/manual", key: "manual", label: "マニュアル", icon: "▤" },
    { href: "/search", key: "search", label: "検索", icon: "⌕" },
    { href: "/notifications", key: "notifications", label: "通知", icon: "●", badge: n as number },
  ];
  const extra = [
    ...(canSeeReviewQueue(actor) ? [{ href: "/review", key: "review", label: "承認・提案" }] : []),
    ...(canAdmin(actor) ? [{ href: "/admin", key: "admin", label: "管理者設定" }] : []),
  ];
  const primary = actor.assignments.find((a) => a.isPrimary) ?? actor.assignments[0];
  const role = primary ? `${clinicName(primary.clinicId)}・${POSITION_LABEL[primary.position]}` : "管理者";
  return (
    <div className="min-h-dvh pb-20 md:flex md:pb-0">
      <aside className="hidden w-56 shrink-0 border-r border-neutral-200 md:block">
        <div className="sticky top-0 p-4">
          <div className="mb-4 text-xs font-bold tracking-widest text-neutral-500">あんど整骨院グループ</div>
          <nav className="space-y-1">
            {[...tabs, ...extra].map((t) => (
              <Link key={t.key} href={t.href} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold ${active === t.key ? "bg-navy text-white" : "text-neutral-800 hover:bg-neutral-100"}`}>
                {t.label}
                {"badge" in t && !!t.badge && <span className="rounded-full bg-red-700 px-1.5 text-xs text-white">{String(t.badge)}</span>}
              </Link>
            ))}
          </nav>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-navy px-4 py-3 text-white">
          <div className="min-w-0">
            <div className="text-[10px] tracking-widest opacity-70">あんど整骨院グループ 社内マニュアル</div>
            <div className="truncate text-sm font-bold">{actor.name}<span className="ml-2 text-xs font-normal opacity-80">{role}</span></div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {extra.map((t) => (
              <Link key={t.key} href={t.href} className="rounded-full border border-white/40 px-2.5 py-1 text-xs font-bold md:hidden">{t.label}</Link>
            ))}
            <form action={logout}>
              <button className="rounded-full border border-white/40 px-2.5 py-1 text-xs">ログアウト</button>
            </form>
          </div>
        </header>
        {hasDormantPrivilege(actor) && (
          <p className="bg-amber-50 px-4 py-2 text-xs text-amber-900">
            院ID＋個人PASSでログイン中のため、{actor.assignments.map((a) => POSITION_LABEL[a.position]).join("・")}の承認・編集はできません（今は{effectivePositions(actor).map((p) => POSITION_LABEL[p]).join("・")}として表示）。メールアドレスでログインしてください。
          </p>
        )}
        <main className="mx-auto max-w-3xl px-4 py-4">{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {tabs.map((t) => (
          <Link key={t.key} href={t.href} className={`relative flex flex-col items-center py-2 text-[11px] font-bold ${active === t.key ? "text-navy" : "text-neutral-500"}`}>
            <span className="text-lg leading-none" aria-hidden>{t.icon}</span>
            {t.label}
            {!!t.badge && <span className="absolute right-[22%] top-1 rounded-full bg-red-700 px-1.5 text-[10px] text-white">{t.badge}</span>}
            {active === t.key && <span className="absolute inset-x-6 top-0 h-0.5 bg-navy" />}
          </Link>
        ))}
      </nav>
    </div>
  );
}
