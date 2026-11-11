import Link from "next/link";
import { Plus } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { EmptyState, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ctxCan, getOrgContext } from "@/lib/auth/context";
import { createClient } from "@/lib/db/server";
import { storeName } from "@/lib/org-data";
import { TEMPLATE_CATEGORIES, type TemplateCategory } from "@/lib/templates";

export const metadata = { title: "メッセージテンプレート" };

export default async function TemplatesPage({ params, searchParams }: PageProps<"/o/[orgSlug]/templates">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const showArchived = sp.archived === "1";
  const ctx = await getOrgContext(orgSlug);
  const supabase = await createClient();
  const { data: templates } = await supabase
    .from("message_templates")
    .select("id, name, category, body, store_id, is_archived, version")
    .eq("organization_id", ctx.org.id)
    .eq("is_archived", showArchived)
    .order("category")
    .order("name");

  const groups = Object.entries(TEMPLATE_CATEGORIES).map(([key, label]) => ({
    key,
    label,
    items: (templates ?? []).filter((t) => t.category === key),
  }));

  return (
    <>
      <PageHeader
        title="メッセージテンプレート"
        description="文面をコピーして、LINE 等の別のツールから送信してください（このシステムからは送信しません）。"
        actions={
          ctxCan(ctx, "template.manage") && (
            <Link href={`/o/${orgSlug}/templates/new`} className={buttonVariants({ size: "sm" })}>
              <Plus /> 新規
            </Link>
          )
        }
      />
      <p className="mb-3 text-sm">
        <Link href={`/o/${orgSlug}/templates${showArchived ? "" : "?archived=1"}`} className="text-primary underline">
          {showArchived ? "使用中のテンプレートを表示" : "アーカイブ済みを表示"}
        </Link>
      </p>
      {templates?.length ? (
        groups
          .filter((g) => g.items.length)
          .map((g) => (
            <section key={g.key} className="mb-5">
              <h2 className="mb-2 text-sm font-bold text-muted-foreground">{g.label}</h2>
              <ul className="grid gap-2">
                {g.items.map((t) => (
                  <li key={t.id} className="rounded-lg border bg-card p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Link href={`/o/${orgSlug}/templates/${t.id}`} className="font-bold text-primary hover:underline">
                        {t.name}
                      </Link>
                      <Badge variant="muted">{t.store_id ? storeName(ctx, t.store_id) : "全店舗共通"}</Badge>
                    </div>
                    <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{t.body}</p>
                    <CopyButton text={t.body} variant="outline" size="sm" className="mt-2" label={`${TEMPLATE_CATEGORIES[t.category as TemplateCategory]}をコピー`} />
                  </li>
                ))}
              </ul>
            </section>
          ))
      ) : (
        <EmptyState>テンプレートはありません。</EmptyState>
      )}
    </>
  );
}
