import Link from "next/link";
import { BarChart3, Building2, ChevronRight, ClipboardCheck, Database, KeyRound, ListChecks, LogOut, ScrollText, Settings, Shield, Store, UserCog } from "lucide-react";
import { signOut } from "@/app/auth-actions";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ctxCan, getOrgContext } from "@/lib/auth/context";
import type { Permission } from "@/lib/auth/permissions";

export const metadata = { title: "その他" };

export default async function MorePage({ params }: PageProps<"/o/[orgSlug]/more">) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  const base = `/o/${orgSlug}`;
  const items: { href: string; label: string; icon: typeof Settings; perm?: Permission }[] = [
    { href: `${base}/analytics`, label: "分析", icon: BarChart3, perm: "analytics.view" },
    { href: `${base}/settings/rules`, label: "フォロー条件", icon: ListChecks, perm: "rule.manage" },
    { href: `${base}/templates`, label: "テンプレート管理", icon: ClipboardCheck },
    { href: `${base}/settings/staff`, label: "スタッフ管理", icon: UserCog, perm: "staff.invite" },
    { href: `${base}/settings/stores`, label: "店舗情報", icon: Store, perm: "store.update" },
    { href: `${base}/settings/organization`, label: "会社情報・組織設定", icon: Building2, perm: "organization.update" },
    { href: `${base}/settings/roles`, label: "権限設定", icon: Shield },
    { href: `${base}/settings/data`, label: "データ管理（エクスポート）", icon: Database, perm: "customer.export" },
    { href: `${base}/settings/audit`, label: "監査ログ", icon: ScrollText, perm: "audit.view" },
    { href: `/account/password`, label: "パスワード変更", icon: KeyRound },
    { href: `/select-org`, label: "組織を切り替える", icon: Building2 },
  ];
  return (
    <>
      <PageHeader title="その他" />
      <ul className="grid gap-1 rounded-lg border bg-card p-1">
        {items
          .filter((i) => !i.perm || ctxCan(ctx, i.perm))
          .map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="flex h-12 items-center gap-3 rounded-md px-3 hover:bg-muted">
                <Icon className="size-5 text-primary" aria-hidden />
                <span className="flex-1 font-semibold">{label}</span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
      </ul>
      <form action={signOut} className="mt-4">
        <Button variant="outline" className="w-full">
          <LogOut /> ログアウト
        </Button>
      </form>
    </>
  );
}
