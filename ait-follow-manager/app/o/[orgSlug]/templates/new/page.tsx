import { createTemplate } from "../actions";
import { TemplateForm } from "../template-form";
import { PageHeader } from "@/components/page";
import { ctxCan, getOrgContext, requirePermission, storeIdsWith } from "@/lib/auth/context";

export const metadata = { title: "テンプレート作成" };

export default async function NewTemplatePage({ params }: PageProps<"/o/[orgSlug]/templates/new">) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  requirePermission(ctx, "template.manage");
  const storeIds = storeIdsWith(ctx, "template.manage");
  const storeOptions = [
    ...(ctxCan(ctx, "template.manage", null) ? [{ value: "", label: "全店舗共通" }] : []),
    ...ctx.stores.filter((s) => storeIds.includes(s.id)).map((s) => ({ value: s.id, label: `${s.name}用` })),
  ];
  return (
    <>
      <PageHeader title="テンプレート作成" back={`/o/${orgSlug}/templates`} />
      <TemplateForm action={createTemplate} orgSlug={orgSlug} storeOptions={storeOptions} />
    </>
  );
}
