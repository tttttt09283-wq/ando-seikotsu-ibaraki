import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, ChevronRight } from "lucide-react";
import { signOut } from "@/app/auth-actions";
import { CenteredCard } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { isPlatformAdmin, requireUser } from "@/lib/auth/context";
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import { createClient } from "@/lib/db/server";

export const metadata = { title: "組織の選択" };

export default async function SelectOrgPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: memberships }, platform] = await Promise.all([
    supabase
      .from("memberships")
      .select("role, organization:organizations!inner(id, name, slug, status)")
      .eq("user_id", user.id)
      .eq("status", "active"),
    isPlatformAdmin(),
  ]);

  const orgs = new Map<string, { name: string; slug: string; status: string; roles: Set<Role> }>();
  for (const m of memberships ?? []) {
    const o = m.organization;
    const entry = orgs.get(o.id) ?? { name: o.name, slug: o.slug, status: o.status, roles: new Set<Role>() };
    entry.roles.add(m.role as Role);
    orgs.set(o.id, entry);
  }
  const list = [...orgs.values()];
  if (list.length === 1 && !platform && list[0].status === "active") redirect(`/o/${list[0].slug}/dashboard`);

  return (
    <CenteredCard title="組織を選択">
      <ul className="grid gap-2">
        {list.map((o) => (
          <li key={o.slug}>
            <Link
              href={`/o/${o.slug}/dashboard`}
              className="flex items-center gap-3 rounded-md border p-3 hover:bg-muted"
            >
              <Building2 className="size-5 text-primary" aria-hidden />
              <span className="flex-1">
                <span className="block font-semibold">{o.name}</span>
                <span className="text-xs text-muted-foreground">
                  {[...o.roles].map((r) => ROLE_LABELS[r]).join("・")}
                  {o.status !== "active" && "（利用停止中）"}
                </span>
              </span>
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </li>
        ))}
        {platform && (
          <li>
            <Link href="/platform" className="flex items-center gap-3 rounded-md border border-navy/30 bg-navy p-3 text-navy-foreground">
              <span className="flex-1 font-semibold">運営管理（Platform Admin）</span>
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </li>
        )}
        {list.length === 0 && !platform && (
          <li className="text-sm text-muted-foreground">所属している組織がありません。管理者にお問い合わせください。</li>
        )}
      </ul>
      <form action={signOut} className="mt-6">
        <Button variant="outline" className="w-full">
          ログアウト
        </Button>
      </form>
    </CenteredCard>
  );
}
