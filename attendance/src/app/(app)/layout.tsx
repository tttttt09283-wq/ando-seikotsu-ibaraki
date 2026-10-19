import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { ROLE_LABELS, isHq, managedClinicIds } from "@/lib/auth/permissions";
import { signOut } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const hq = isHq(actor);
  const manager = managedClinicIds(actor).length > 0;

  const nav = [
    ...(hq ? [{ href: "/hq", label: "本部ホーム" }] : []),
    ...(manager || hq
      ? [
          { href: "/manager", label: "院ホーム" },
          { href: "/manager/shifts", label: "シフト" },
          { href: "/manager/attendance", label: "勤怠" },
          { href: "/manager/leave", label: "休暇申請" },
          { href: "/manager/holiday-credits", label: "振休" },
        ]
      : []),
    ...(hq
      ? [
          { href: "/hq/leave", label: "有給台帳" },
          { href: "/admin/clinics", label: "店舗マスタ" },
          { href: "/admin/holidays", label: "会社カレンダー" },
          { href: "/admin/staff", label: "スタッフ" },
          { href: "/admin/users", label: "アカウント・権限" },
          { href: "/admin/kiosks", label: "共用端末" },
        ]
      : []),
    { href: "/me", label: "マイページ" },
  ];
  const roleLabels = [...new Set(actor.roles.map((r) => ROLE_LABELS[r.role]))].join("・") || "ロール未設定";

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="font-bold text-navy-900">
            <span className="text-brand-600">あんど</span> 勤怠管理
          </Link>
          <nav className="flex flex-wrap gap-1 text-sm">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-md px-3 py-1.5 text-slate-700 hover:bg-brand-50">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">
              {actor.displayName}（{roleLabels}）
            </span>
            <form action={signOut}>
              <button type="submit" className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50">
                ログアウト
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
