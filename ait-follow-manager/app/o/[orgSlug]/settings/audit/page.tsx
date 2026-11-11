import { PageHeader } from "@/components/page";
import { getOrgContext, requirePermission } from "@/lib/auth/context";
import { createClient } from "@/lib/db/server";
import { formatJpDateTime } from "@/lib/dates";

export const metadata = { title: "監査ログ" };

const ENTITY_LABELS: Record<string, string> = {
  customers: "顧客",
  memberships: "スタッフ所属",
  stores: "店舗",
  consent_records: "連絡同意",
  followup_rules: "フォロー条件",
  followup_tasks: "フォロータスク",
  message_templates: "テンプレート",
  organizations: "組織",
};
const OP_LABELS: Record<string, string> = { insert: "作成", update: "更新", delete: "削除" };

function describe(action: string) {
  const [, op] = action.split(".");
  if (OP_LABELS[op]) return OP_LABELS[op];
  const special: Record<string, string> = {
    "customer.anonymized": "個人情報削除",
    "customer.exported": "エクスポート",
    "followup.generated_manual": "手動抽出",
    "followup.generated_scheduled": "自動抽出",
    "organization.updated": "組織設定の更新",
  };
  return special[action] ?? action;
}

export default async function AuditPage({ params }: PageProps<"/o/[orgSlug]/settings/audit">) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  requirePermission(ctx, "audit.view", null);
  const supabase = await createClient();
  const [{ data: logs }, { data: users }] = await Promise.all([
    supabase.from("audit_logs").select("id, actor_user_id, action, entity_type, changes, created_at").eq("organization_id", ctx.org.id).order("created_at", { ascending: false }).limit(200),
    supabase.from("users").select("id, display_name"),
  ]);
  const names = new Map((users ?? []).map((u) => [u.id, u.display_name]));
  return (
    <>
      <PageHeader title="監査ログ" back={`/o/${orgSlug}/more`} description="直近200件。個人情報の値は記録せず、変更された項目名のみを記録しています。" />
      <ul className="grid gap-1 text-sm">
        {(logs ?? []).map((l) => {
          const fields = ((l.changes as { fields?: string[] })?.fields ?? []).join(", ");
          return (
            <li key={l.id} className="rounded-md border bg-card p-2">
              <div className="flex flex-wrap gap-2">
                <span className="tabular-nums text-muted-foreground">{formatJpDateTime(l.created_at, ctx.org.timezone)}</span>
                <span className="font-semibold">{l.actor_user_id ? (names.get(l.actor_user_id) ?? "（不明なユーザー）") : "システム"}</span>
                <span>
                  {ENTITY_LABELS[l.entity_type] ?? l.entity_type}・{describe(l.action)}
                </span>
              </div>
              {fields && <p className="mt-0.5 break-all text-xs text-muted-foreground">項目：{fields}</p>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
