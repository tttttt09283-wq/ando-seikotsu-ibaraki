import { updateOrganization } from "../actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PageHeader } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { getOrgContext, requirePermission } from "@/lib/auth/context";
import { createClient } from "@/lib/db/server";

export const metadata = { title: "会社情報・組織設定" };

export default async function OrganizationSettingsPage({ params }: PageProps<"/o/[orgSlug]/settings/organization">) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  requirePermission(ctx, "organization.update", null);
  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("name, phone, address, contact_email").eq("id", ctx.org.id).single();
  return (
    <>
      <PageHeader title="会社情報・組織設定" back={`/o/${orgSlug}/more`} />
      <ActionForm action={updateOrganization}>
        <input type="hidden" name="orgSlug" value={orgSlug} />
        <Card>
          <CardHeader>
            <CardTitle>会社情報</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Field label="会社名" htmlFor="name">
              <Input id="name" name="name" required maxLength={100} defaultValue={org?.name} />
            </Field>
            <Field label="電話番号" htmlFor="phone">
              <Input id="phone" name="phone" maxLength={20} defaultValue={org?.phone ?? ""} />
            </Field>
            <Field label="住所" htmlFor="address">
              <Input id="address" name="address" maxLength={200} defaultValue={org?.address ?? ""} />
            </Field>
            <Field label="連絡先メール" htmlFor="contactEmail">
              <Input id="contactEmail" name="contactEmail" type="email" defaultValue={org?.contact_email ?? ""} />
            </Field>
            <p className="text-xs text-muted-foreground">組織 ID（URL）：{ctx.org.slug}　タイムゾーン：{ctx.org.timezone}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>フォロー・閲覧の設定</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="includeUnknownConsent" defaultChecked={ctx.org.settings.include_unknown_consent} className="mt-0.5 size-5" />
              <span>
                <span className="font-semibold">連絡同意が未確認の顧客も連絡タスクの対象にする</span>
                <span className="block text-muted-foreground">既定は OFF（同意を確認できた顧客のみ対象）。配信停止・連絡不可の顧客は常に対象外です。</span>
              </span>
            </label>
            <Field label="スタッフが閲覧できる顧客" htmlFor="staffVisibility">
              <Select id="staffVisibility" name="staffVisibility" defaultValue={ctx.org.settings.staff_visibility}>
                <option value="store">所属店舗の全顧客</option>
                <option value="assigned">自分が担当の顧客のみ</option>
              </Select>
            </Field>
          </CardContent>
        </Card>
        <SubmitButton size="lg">保存する</SubmitButton>
      </ActionForm>
    </>
  );
}
