import Link from "next/link";
import { Brand } from "@/components/brand";
import { BottomNav } from "@/components/nav";
import { getOrgContext } from "@/lib/auth/context";
import { ROLE_LABELS } from "@/lib/auth/permissions";

export default async function OrgLayout({ children, params }: LayoutProps<"/o/[orgSlug]">) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  return (
    <div className="min-h-dvh pb-20 md:flex md:pb-0">
      <aside className="hidden w-56 shrink-0 border-r bg-card p-3 md:block">
        <Link href={`/o/${orgSlug}/dashboard`} className="mb-4 block px-3 py-2 text-sm">
          <Brand />
        </Link>
        <BottomNav orgSlug={orgSlug} />
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 bg-navy text-navy-foreground">
          <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
            <span className="text-sm md:hidden">
              <Brand className="text-navy-foreground" />
            </span>
            <span className="ml-auto truncate text-right text-xs leading-tight">
              <span className="block font-semibold">{ctx.org.name}</span>
              <span className="text-navy-foreground/70">
                {ctx.displayName}（{ROLE_LABELS[ctx.role]}）
              </span>
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-4">{children}</main>
      </div>
      <div className="md:hidden">
        <BottomNav orgSlug={orgSlug} />
      </div>
    </div>
  );
}
