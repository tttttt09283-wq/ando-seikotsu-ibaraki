import { FlaskConical, LogOut } from "lucide-react";
import { selectOrgAction, signOutAction, resetDemoAction } from "@/app/actions";
import { BottomNav, SideNav } from "@/components/app/Nav";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/lib/cash/types";
import { requireOrg } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { repo, user, data, orgs } = await requireOrg();
  const demo = repo.mode === "demo";
  return (
    <div className="min-h-dvh">
      {demo && (
        <div role="note" className="bg-demo text-demo-foreground sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1.5 text-center text-xs font-semibold">
          <span className="inline-flex items-center gap-1">
            <FlaskConical className="size-3.5" aria-hidden />
            デモモード：表示している企業・口座・金額はすべて架空のデモデータです（実在の実績ではありません）
          </span>
          <form action={resetDemoAction}>
            <button type="submit" className="underline underline-offset-2">
              最初の状態に戻す
            </button>
          </form>
        </div>
      )}
      <div className="mx-auto flex max-w-7xl">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r px-3 py-5 lg:flex">
          <div className="px-3">
            <p className="text-lg font-bold tracking-tight">A.I.T Cash Flow</p>
            <p className="text-muted-foreground text-xs">資金繰りを、ひと目で。</p>
          </div>
          <SideNav />
          <div className="mt-auto space-y-2 px-3 text-xs">
            <p className="text-muted-foreground break-all">
              {user.email}
              <br />
              {ROLE_LABEL[data.role]}
            </p>
            <form action={signOutAction}>
              <Button variant="ghost" size="sm" type="submit" className="-ml-3">
                <LogOut aria-hidden /> ログアウト
              </Button>
            </form>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="flex items-center justify-between gap-3 border-b px-4 py-3 lg:px-8">
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs lg:hidden">A.I.T Cash Flow</p>
              {orgs.length > 1 ? (
                <form action={selectOrgAction} className="flex items-center gap-2">
                  <select name="organization_id" defaultValue={data.organization.id} aria-label="企業" className="bg-card h-9 max-w-56 rounded-md border px-2 text-sm font-semibold">
                    {orgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="outline" type="submit">
                    切替
                  </Button>
                </form>
              ) : (
                <p className="truncate font-semibold">{data.organization.name}</p>
              )}
            </div>
            <form action={signOutAction} className="lg:hidden">
              <Button variant="ghost" size="icon" type="submit" aria-label="ログアウト">
                <LogOut aria-hidden />
              </Button>
            </form>
          </header>
          <main className="px-4 pt-5 pb-28 lg:px-8 lg:pb-10">{children}</main>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

// 利用者ごとのデータ・設定を表示するため、ビルド時に静的生成しない
export const dynamic = "force-dynamic";
