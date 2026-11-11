import { createRule, runExtraction, updateRule } from "../actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PageHeader } from "@/components/page";
import { PRIORITY_LABELS } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { ctxCan, getOrgContext, requirePermission, storeIdsWith } from "@/lib/auth/context";
import { createClient } from "@/lib/db/server";
import { RULE_TYPE_LABELS, type RuleType } from "@/lib/followup/types";
import { storeName } from "@/lib/org-data";

export const metadata = { title: "フォロー条件" };

type Rule = {
  id: string;
  name: string;
  rule_type: string;
  store_id: string | null;
  offset_days: number;
  due_in_days: number;
  max_lookback_days: number;
  task_kind: string;
  priority: string;
  assignee_strategy: string;
  default_template_id: string | null;
  is_active: boolean;
};

function RuleFields({ r, templates, idp }: { r?: Rule; templates: { id: string; name: string }[]; idp: string }) {
  return (
    <>
      <Field label="名前（タスク名になります）" htmlFor={`${idp}-name`}>
        <Input id={`${idp}-name`} name="name" required maxLength={60} defaultValue={r?.name} />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="経過日数" htmlFor={`${idp}-offset`} hint="起点から何日後">
          <Input id={`${idp}-offset`} name="offsetDays" type="number" min={0} max={730} required defaultValue={r?.offset_days ?? 7} />
        </Field>
        <Field label="対応期限" htmlFor={`${idp}-due`} hint="生成から何日以内">
          <Input id={`${idp}-due`} name="dueInDays" type="number" min={0} max={30} required defaultValue={r?.due_in_days ?? 3} />
        </Field>
        <Field label="遡り日数" htmlFor={`${idp}-lookback`} hint="これより古い起点は対象外">
          <Input id={`${idp}-lookback`} name="maxLookbackDays" type="number" min={0} max={365} required defaultValue={r?.max_lookback_days ?? 14} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="種別" htmlFor={`${idp}-kind`}>
          <Select id={`${idp}-kind`} name="taskKind" defaultValue={r?.task_kind ?? "contact"}>
            <option value="contact">連絡</option>
            <option value="internal">社内作業</option>
          </Select>
        </Field>
        <Field label="優先度" htmlFor={`${idp}-priority`}>
          <Select id={`${idp}-priority`} name="priority" defaultValue={r?.priority ?? "normal"}>
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="担当" htmlFor={`${idp}-assignee`}>
          <Select id={`${idp}-assignee`} name="assigneeStrategy" defaultValue={r?.assignee_strategy ?? "customer_staff"}>
            <option value="customer_staff">顧客の担当</option>
            <option value="store_manager">店舗責任者</option>
            <option value="unassigned">未割当</option>
          </Select>
        </Field>
      </div>
      <Field label="既定のテンプレート" htmlFor={`${idp}-template`}>
        <Select id={`${idp}-template`} name="templateId" defaultValue={r?.default_template_id ?? ""}>
          <option value="">なし</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={r?.is_active ?? true} className="size-5" />
        有効
      </label>
    </>
  );
}

export default async function RulesPage({ params }: PageProps<"/o/[orgSlug]/settings/rules">) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  requirePermission(ctx, "rule.manage");
  const supabase = await createClient();
  const [{ data: rules }, { data: templates }] = await Promise.all([
    supabase.from("followup_rules").select("*").eq("organization_id", ctx.org.id).order("created_at"),
    supabase.from("message_templates").select("id, name").eq("organization_id", ctx.org.id).eq("is_archived", false).order("name"),
  ]);
  const manageStores = storeIdsWith(ctx, "rule.manage");
  const orgHidden = <input type="hidden" name="orgSlug" value={orgSlug} />;

  return (
    <>
      <PageHeader
        title="フォロー条件"
        back={`/o/${orgSlug}/more`}
        description="毎朝6時（日本時間）に自動で抽出します。配信停止・連絡不可の顧客は連絡タスクの対象外です。"
      />
      <Card className="mb-4">
        <CardContent className="grid gap-2 pt-4">
          <ActionForm action={runExtraction} className="grid grid-cols-2 gap-2">
            {orgHidden}
            <SubmitButton name="mode" value="preview" variant="outline">
              対象件数を確認
            </SubmitButton>
            <SubmitButton name="mode" value="run">
              今すぐ抽出
            </SubmitButton>
          </ActionForm>
          <p className="text-xs text-muted-foreground">
            同じ顧客・同じ条件・同じ起点のタスクは重複して作成されません。予約データがない顧客は「予約未確認」として扱います。
          </p>
        </CardContent>
      </Card>

      <ul className="grid gap-2">
        {(rules ?? []).map((r) => {
          const editable = ctxCan(ctx, "rule.manage", r.store_id);
          return (
            <li key={r.id}>
              <details className="rounded-lg border bg-card">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-3">
                  <span className="font-bold">{r.name}</span>
                  {!r.is_active && <Badge variant="muted">無効</Badge>}
                  <Badge variant="outline">{r.store_id ? storeName(ctx, r.store_id) : "全店舗"}</Badge>
                  <span className="w-full text-xs text-muted-foreground">
                    {RULE_TYPE_LABELS[r.rule_type as RuleType]}：{r.rule_type === "no_confirmed_next_appointment" ? `最終来店から${r.offset_days}日経過・予約未確認` : `${r.offset_days}日`}
                    ／期限 {r.due_in_days}日／{r.task_kind === "internal" ? "社内作業" : "連絡"}
                  </span>
                </summary>
                {editable && (
                  <div className="border-t p-3">
                    <ActionForm action={updateRule}>
                      {orgHidden}
                      <input type="hidden" name="ruleId" value={r.id} />
                      <input type="hidden" name="ruleType" value={r.rule_type} />
                      <RuleFields r={r as Rule} templates={templates ?? []} idp={r.id} />
                      <SubmitButton variant="outline">保存</SubmitButton>
                    </ActionForm>
                  </div>
                )}
              </details>
            </li>
          );
        })}
      </ul>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>条件を追加</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={createRule}>
            {orgHidden}
            <div className="grid grid-cols-2 gap-2">
              <Field label="条件の種類" htmlFor="new-type">
                <Select id="new-type" name="ruleType" defaultValue="days_since_last_visit">
                  {Object.entries(RULE_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="対象店舗" htmlFor="new-store">
                <Select id="new-store" name="storeId" defaultValue={ctxCan(ctx, "rule.manage", null) ? "" : manageStores[0]}>
                  {ctxCan(ctx, "rule.manage", null) && <option value="">全店舗</option>}
                  {ctx.stores
                    .filter((s) => manageStores.includes(s.id))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </Select>
              </Field>
            </div>
            <RuleFields templates={templates ?? []} idp="new" />
            <SubmitButton>追加</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </>
  );
}
