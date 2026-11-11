import { createStore, updateStore } from "../actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { ctxCan, getOrgContext, requirePermission } from "@/lib/auth/context";
import { createClient } from "@/lib/db/server";

export const metadata = { title: "店舗情報" };

function StoreFields({ s }: { s?: { name: string; code: string; phone: string | null; address: string | null } }) {
  return (
    <>
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <Field label="店舗名" htmlFor={`name-${s?.code ?? "new"}`}>
          <Input id={`name-${s?.code ?? "new"}`} name="name" required maxLength={100} defaultValue={s?.name} />
        </Field>
        <Field label="店舗コード" htmlFor={`code-${s?.code ?? "new"}`}>
          <Input id={`code-${s?.code ?? "new"}`} name="code" required maxLength={20} pattern="[A-Za-z0-9_\-]+" defaultValue={s?.code} />
        </Field>
      </div>
      <Field label="電話番号" htmlFor={`phone-${s?.code ?? "new"}`}>
        <Input id={`phone-${s?.code ?? "new"}`} name="phone" maxLength={20} defaultValue={s?.phone ?? ""} />
      </Field>
      <Field label="住所" htmlFor={`address-${s?.code ?? "new"}`}>
        <Input id={`address-${s?.code ?? "new"}`} name="address" maxLength={200} defaultValue={s?.address ?? ""} />
      </Field>
    </>
  );
}

export default async function StoresPage({ params }: PageProps<"/o/[orgSlug]/settings/stores">) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  requirePermission(ctx, "store.update");
  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores").select("id, name, code, phone, address, is_active").eq("organization_id", ctx.org.id).order("code");
  return (
    <>
      <PageHeader title="店舗情報" back={`/o/${orgSlug}/more`} />
      <div className="grid gap-3">
        {(stores ?? [])
          .filter((s) => ctxCan(ctx, "store.update", s.id))
          .map((s) => (
            <Card key={s.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {s.name} {!s.is_active && <Badge variant="muted">無効</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={updateStore}>
                  <input type="hidden" name="orgSlug" value={orgSlug} />
                  <input type="hidden" name="storeId" value={s.id} />
                  <StoreFields s={s} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="isActive" defaultChecked={s.is_active} className="size-5" />
                    有効
                  </label>
                  <SubmitButton variant="outline">保存</SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          ))}
        {ctxCan(ctx, "store.create", null) && (
          <Card>
            <CardHeader>
              <CardTitle>店舗を追加</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={createStore} resetOnSuccess>
                <input type="hidden" name="orgSlug" value={orgSlug} />
                <StoreFields />
                <SubmitButton>追加</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
