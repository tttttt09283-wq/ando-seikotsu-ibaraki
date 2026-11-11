import { changeRole, inviteStaff, setMembershipStatus } from "../actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { ctxCan, getOrgContext, requirePermission, storeIdsWith } from "@/lib/auth/context";
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import { createClient } from "@/lib/db/server";
import { storeName } from "@/lib/org-data";

export const metadata = { title: "スタッフ管理" };

export default async function StaffPage({ params }: PageProps<"/o/[orgSlug]/settings/staff">) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  requirePermission(ctx, "staff.invite");
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("memberships")
    .select("id, user_id, role, store_id, status, user:users(display_name, email)")
    .eq("organization_id", ctx.org.id)
    .order("role")
    .order("created_at");
  const inviteStores = storeIdsWith(ctx, "staff.invite");
  const isAdmin = ctxCan(ctx, "staff.change_role", null);

  return (
    <>
      <PageHeader title="スタッフ管理" back={`/o/${orgSlug}/more`} />
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>スタッフを招待</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={inviteStaff} resetOnSuccess>
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="氏名" htmlFor="displayName">
                <Input id="displayName" name="displayName" required maxLength={50} />
              </Field>
              <Field label="メールアドレス" htmlFor="email">
                <Input id="email" name="email" type="email" required />
              </Field>
              <Field label="ロール" htmlFor="role">
                <Select id="role" name="role" defaultValue="staff">
                  <option value="staff">{ROLE_LABELS.staff}</option>
                  {isAdmin && <option value="store_manager">{ROLE_LABELS.store_manager}</option>}
                  {isAdmin && <option value="org_admin">{ROLE_LABELS.org_admin}（全店舗）</option>}
                </Select>
              </Field>
              <Field label="所属店舗" htmlFor="storeId">
                <Select id="storeId" name="storeId">
                  {ctx.stores
                    .filter((s) => inviteStores.includes(s.id))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </Select>
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">本人宛てに招待メールが届き、本人がパスワードを設定します。アカウントの共有はしないでください。</p>
            <SubmitButton>招待する</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <h2 className="mb-2 font-bold">所属スタッフ</h2>
      <ul className="grid gap-2">
        {(members ?? []).map((m) => {
          const u = m.user as { display_name: string; email: string } | null;
          const canEdit = m.user_id !== ctx.userId && (m.role === "staff" ? ctxCan(ctx, "staff.invite", m.store_id) : isAdmin);
          const hidden = (
            <>
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <input type="hidden" name="membershipId" value={m.id} />
            </>
          );
          return (
            <li key={m.id} className="rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{u?.display_name}</span>
                <Badge variant={m.role === "org_admin" ? "navy" : "default"}>{ROLE_LABELS[m.role as Role]}</Badge>
                <Badge variant="muted">{m.store_id ? storeName(ctx, m.store_id) : "全店舗"}</Badge>
                {m.status !== "active" && <Badge variant="danger">無効</Badge>}
              </div>
              <p className="text-xs break-all text-muted-foreground">{u?.email}</p>
              {canEdit && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <ActionForm action={setMembershipStatus} className="contents" confirmMessage={m.status === "active" ? "このスタッフを無効にしますか？" : undefined}>
                    {hidden}
                    <input type="hidden" name="status" value={m.status === "active" ? "disabled" : "active"} />
                    <SubmitButton size="sm" variant={m.status === "active" ? "danger-outline" : "outline"}>
                      {m.status === "active" ? "無効にする" : "有効にする"}
                    </SubmitButton>
                  </ActionForm>
                  {isAdmin && m.role !== "org_admin" && (
                    <ActionForm action={changeRole} className="flex gap-1">
                      {hidden}
                      <Select name="role" defaultValue={m.role} className="h-9 w-36 text-sm" aria-label="ロール">
                        <option value="staff">{ROLE_LABELS.staff}</option>
                        <option value="store_manager">{ROLE_LABELS.store_manager}</option>
                      </Select>
                      <SubmitButton size="sm" variant="outline">
                        変更
                      </SubmitButton>
                    </ActionForm>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
