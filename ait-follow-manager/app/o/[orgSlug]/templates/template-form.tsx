import { ActionForm, SubmitButton, type ActionState } from "@/components/forms";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { TEMPLATE_CATEGORIES, TEMPLATE_VARIABLES } from "@/lib/templates";

export function TemplateForm({
  action,
  orgSlug,
  template,
  storeOptions,
  disabled,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  orgSlug: string;
  template?: { id: string; name: string; body: string; category: string; store_id: string | null };
  storeOptions?: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="orgSlug" value={orgSlug} />
      {template && <input type="hidden" name="templateId" value={template.id} />}
      <Field label="名前" htmlFor="name">
        <Input id="name" name="name" required maxLength={60} defaultValue={template?.name} disabled={disabled} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="カテゴリ" htmlFor="category">
          <Select id="category" name="category" defaultValue={template?.category ?? "other"} disabled={disabled}>
            {Object.entries(TEMPLATE_CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        {storeOptions && (
          <Field label="対象" htmlFor="storeId">
            <Select id="storeId" name="storeId" defaultValue={template?.store_id ?? ""}>
              {storeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <Field
        label="本文"
        htmlFor="body"
        hint={`差し込み変数：${TEMPLATE_VARIABLES.map((v) => `{{${v}}}`).join(" ")}。症状や効果を断定する表現は避けてください。`}
      >
        <Textarea id="body" name="body" required maxLength={2000} defaultValue={template?.body} className="min-h-56" disabled={disabled} />
      </Field>
      {!disabled && <SubmitButton>保存する</SubmitButton>}
    </ActionForm>
  );
}
