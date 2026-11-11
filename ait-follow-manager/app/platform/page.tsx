import { notFound } from "next/navigation";
import { createOrganization, inviteOrgAdmin, setOrganizationStatus } from "./actions";
import { signOut } from "@/app/auth-actions";
import { Brand } from "@/components/brand";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { ensureMfaIfRequired, isPlatformAdmin, requireUser } from "@/lib/auth/context";
import { createClient } from "@/lib/db/server";
import { formatJpDateTime } from "@/lib/dates";

export const metadata = { title: "運営管理" };

export default async function PlatformPage() {
  await requireUser();
  if (!(await isPlatformAdmin())) notFound();
  await ensureMfaIfRequired(true);
  const supabase = await createClient();
  const [{ data: orgs }, { data: logs }] = await Promise.all([supabase.rpc("platform_org_summaries"), supabase.rpc("platform_audit_logs", { p_limit: 30 })]);

  return (
    <div className="min-h-dvh">
      <header className="bg-navy text-navy-foreground">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4 text-sm">
          <Brand className="text-navy-foreground" />
          <span className="ml-2 rounded bg-white/15 px-2 py-0.5 text-xs">運営管理</span>
          <form action={signOut} className="ml-auto">
            <Button variant="ghost" size="sm" className="text-navy-foreground hover:bg-white/10">
              ログアウト
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto grid max-w-3xl gap-4 px-4 py-4">
        <p className="rounded-md bg-info-soft p-3 text-xs text-navy">
          運営管理者は組織の作成・停止と件数の確認のみ可能です。顧客の個人情報は閲覧できません（データベースの行レベルセキュリティで制限）。
        </p>
        <Card>
          <CardHeader>
            <CardTitle>組織を作成</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createOrganization} resetOnSuccess>
              <div className="grid gap-2 sm:grid-cols-3">
                <Field label="組織名" htmlFor="name">
                  <Input id="name" name="name" required maxLength={100} />
                </Field>
                <Field label="URL 用 ID" htmlFor="slug">
                  <Input id="slug" name="slug" required pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" placeholder="example-clinic" />
                </Field>
                <Field label="最初の店舗名" htmlFor="storeName">
                  <Input id="storeName" name="storeName" required maxLength={100} />
                </Field>
              </div>
              <SubmitButton>作成</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>

        <h2 className="font-bold">組織一覧</h2>
        <ul className="grid gap-2">
          {(orgs ?? []).map((o) => (
            <li key={o.id} className="rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{o.name}</span>
                <span className="text-xs text-muted-foreground">/{o.slug}</span>
                <Badge variant={o.status === "active" ? "success" : "danger"}>{o.status === "active" ? "利用中" : "停止中"}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                店舗 {o.store_count}・スタッフ {o.member_count}・顧客 {o.customer_count}
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                <ActionForm action={inviteOrgAdmin} className="grid grid-cols-[1fr_1fr_auto] gap-1">
                  <input type="hidden" name="orgId" value={o.id} />
                  <Input name="displayName" placeholder="管理者氏名" required className="h-9 text-sm" aria-label="管理者氏名" />
                  <Input name="email" type="email" placeholder="メール" required className="h-9 text-sm" aria-label="管理者メール" />
                  <SubmitButton size="sm" variant="outline">
                    招待
                  </SubmitButton>
                </ActionForm>
                <ActionForm action={setOrganizationStatus} confirmMessage={o.status === "active" ? "この組織の利用を停止しますか？" : undefined}>
                  <input type="hidden" name="orgId" value={o.id} />
                  <input type="hidden" name="status" value={o.status === "active" ? "suspended" : "active"} />
                  <SubmitButton size="sm" variant={o.status === "active" ? "danger-outline" : "outline"}>
                    {o.status === "active" ? "停止" : "再開"}
                  </SubmitButton>
                </ActionForm>
              </div>
            </li>
          ))}
        </ul>

        <h2 className="font-bold">運営操作の履歴</h2>
        <ul className="grid gap-1 text-xs">
          {(logs ?? []).map((l) => (
            <li key={l.id} className="rounded border bg-card p-2">
              {formatJpDateTime(l.created_at)}　{l.action}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
