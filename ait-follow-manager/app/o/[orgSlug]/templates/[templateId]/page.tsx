import { notFound } from "next/navigation";
import { duplicateTemplate, setTemplateArchived, updateTemplate } from "../actions";
import { TemplateForm } from "../template-form";
import { CopyButton } from "@/components/copy-button";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ctxCan, getOrgContext } from "@/lib/auth/context";
import { renderForCustomer } from "@/lib/customer-vars";
import { createClient } from "@/lib/db/server";
import { storeName } from "@/lib/org-data";

export const metadata = { title: "テンプレート" };

export default async function TemplatePage({ params, searchParams }: PageProps<"/o/[orgSlug]/templates/[templateId]">) {
  const { orgSlug, templateId } = await params;
  const sp = await searchParams;
  const ctx = await getOrgContext(orgSlug);
  if (!/^[0-9a-f-]{36}$/.test(templateId)) notFound();
  const supabase = await createClient();
  const { data: t } = await supabase.from("message_templates").select("*").eq("id", templateId).eq("organization_id", ctx.org.id).maybeSingle();
  if (!t) notFound();
  const canManage = ctxCan(ctx, "template.manage", t.store_id);
  const canDuplicate = ctxCan(ctx, "template.manage");
  const preview = renderForCustomer(t.body, {
    customer: { family_name: "見本", given_name: "花子" },
    storeName: t.store_id ? storeName(ctx, t.store_id) : (ctx.stores[0]?.name ?? "店舗名"),
    staffName: ctx.displayName,
    nextAppointmentAt: null,
    timeZone: ctx.org.timezone,
  });
  const hidden = (
    <>
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="templateId" value={t.id} />
    </>
  );

  return (
    <>
      <PageHeader
        title={t.name}
        back={`/o/${orgSlug}/templates`}
        description={
          <span className="flex gap-2">
            <Badge variant="muted">{t.store_id ? storeName(ctx, t.store_id) : "全店舗共通"}</Badge>
            <Badge variant="muted">第{t.version}版</Badge>
            {t.is_archived && <Badge variant="warning">アーカイブ済み</Badge>}
          </span>
        }
      />
      {sp.copied && <p className="mb-3 rounded-md bg-success-soft px-3 py-2 text-sm text-success">テンプレートを複製しました。</p>}
      {sp.saved && <p className="mb-3 rounded-md bg-success-soft px-3 py-2 text-sm text-success">テンプレートを作成しました。</p>}

      <Card className="mb-3">
        <CardHeader>
          <CardTitle>プレビュー（見本の顧客）</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 font-sans text-sm">{preview}</pre>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={t.body} variant="outline" label="本文をコピー" />
            {canDuplicate && (
              <ActionForm action={duplicateTemplate} className="contents">
                {hidden}
                <SubmitButton variant="outline">複製して編集</SubmitButton>
              </ActionForm>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-3">
        <CardHeader>
          <CardTitle>{canManage ? "編集" : "内容"}</CardTitle>
        </CardHeader>
        <CardContent>
          <TemplateForm action={updateTemplate} orgSlug={orgSlug} template={t} disabled={!canManage} />
        </CardContent>
      </Card>

      {canManage && (
        <ActionForm action={setTemplateArchived}>
          {hidden}
          <input type="hidden" name="archived" value={t.is_archived ? "false" : "true"} />
          <SubmitButton variant="ghost">{t.is_archived ? "アーカイブから戻す" : "アーカイブする"}</SubmitButton>
        </ActionForm>
      )}
    </>
  );
}
