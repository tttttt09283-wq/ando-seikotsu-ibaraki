import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMe, canAnywhere } from "@/server/session";
import { approvalQueue, unreadNotifications } from "@/server/requests";
import { partTimeQueue } from "@/server/part-time";
import { holidayChangeQueue } from "@/server/holiday-change";
import { ruleQueue, myUnacknowledgedRules } from "@/server/rules";
import { describeRoles } from "@/lib/roles";
import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe();
  if (me.must_change_password) redirect("/account/password");
  const [isAdmin, canLeaveAdmin, canPaid, canShift, canPtApprove, canPtRequest, canHcRequest, canHcGm, canHcFinal, unread, canRuleApprove] = await Promise.all([
    canAnywhere("master.manage"), canAnywhere("leave.adjust"), canAnywhere("leave.paid.final_approve"), canAnywhere("leave.shift.approve"),
    canAnywhere("parttime.final_approve"), canAnywhere("parttime.request"),
    canAnywhere("holidaychange.request"), canAnywhere("holidaychange.gm_review"), canAnywhere("holidaychange.final_approve"), unreadNotifications(), canAnywhere("rule.approve"),
  ]);
  const canHcApprove = canHcGm || canHcFinal;
  const canApprove = canPaid || canShift || canPtApprove || canHcApprove || canRuleApprove;
  const [q1, q2, q3] = await Promise.all([
    canPaid || canShift ? approvalQueue() : Promise.resolve([]), canPtApprove ? partTimeQueue() : Promise.resolve([]), canHcApprove ? holidayChangeQueue() : Promise.resolve([]),
  ]);
  const [rq, unackRules] = await Promise.all([canRuleApprove ? ruleQueue() : Promise.resolve([]), myUnacknowledgedRules()]);
  const queueCount = q1.length + q2.length + q3.length + rq.length;
  const nav = [
    { href: "/", label: "ホーム" },
    { href: "/me", label: "マイページ" },
    { href: "/leave", label: "休暇の申請" },
    ...(canPtRequest || canPtApprove ? [{ href: "/part-time", label: "アルバイト勤務" }] : []),
    ...(canHcRequest || canHcApprove ? [{ href: "/holiday-change", label: "振休→勤務" }] : []),
    ...(canApprove ? [{ href: "/approvals", label: `承認${queueCount ? `（${queueCount}）` : ""}` }] : []),
    { href: "/meetings", label: "会議" },
    { href: "/tasks", label: "タスク" },
    { href: "/rules", label: `規定${unackRules.length ? `（未確認${unackRules.length}）` : ""}` },
    { href: "/notifications", label: `通知${unread ? `（${unread}）` : ""}` },
    ...(isAdmin ? [{ href: "/admin/users", label: "スタッフ管理" }, { href: "/admin/stores", label: "店舗・エリア" }] : []),
    ...(canLeaveAdmin ? [{ href: "/admin/leave", label: "有給の付与" }, { href: "/admin/import", label: "CSV取り込み" }] : []),
  ];
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 bg-gradient-to-r from-brand-800 to-brand-600 text-white shadow">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <Link href="/" className="leading-tight">
            <span className="block text-[11px] font-bold tracking-widest opacity-80">AND GROUP</span>
            <span className="block text-sm font-black">MANAGEMENT SYSTEM</span>
          </Link>
          <div className="flex items-center gap-2 text-xs">
            <span className="hidden text-right sm:block"><b>{me.name}</b><br /><span className="opacity-80">{describeRoles(me)}</span></span>
            <form action={signOut}><Button size="sm" variant="ghost" className="text-white hover:bg-white/15">ログアウト</Button></form>
          </div>
        </div>
        <nav aria-label="メニュー" className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2 pb-1.5">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-bold hover:bg-white/15">{n.label}</Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto grid max-w-5xl grid-cols-1 gap-4 px-4 py-5 [&>*]:min-w-0">{children}</main>
    </div>
  );
}
