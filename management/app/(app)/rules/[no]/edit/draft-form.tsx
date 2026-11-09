"use client";
import { useActionState } from "react";
import { saveDraft, type DraftState } from "../../actions";
import { Input, Field } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/submit-button";
import { ActionForm } from "@/components/action-form";
import { RuleFields } from "@/components/rule-fields";
import type { AppliesTo } from "@/lib/rules";

export function DraftForm({ ruleNo, v }: { ruleNo: string; v: { id: string; version: number; version_no: number; title: string; body: string; applies_to: AppliesTo; effective_date: string | null; is_provisional: boolean; change_summary: string | null } }) {
  const [state, action, pending] = useActionState<DraftState, FormData>(saveDraft, {});
  return (
    <ActionForm action={action} pending={pending} className="grid gap-4">
      <input type="hidden" name="rule_no" value={ruleNo} /><input type="hidden" name="version_id" value={v.id} /><input type="hidden" name="row_version" value={v.version} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <RuleFields title={v.title} body={v.body} applies={v.applies_to} effective={v.effective_date} provisional={v.is_provisional} />
      <Field label={v.version_no > 1 ? "改定内容（必須：何を変えたか）" : "改定内容（任意）"}><Input name="change_summary" defaultValue={v.change_summary ?? ""} maxLength={300} placeholder="例：決定事項の書き方を追加" /></Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="intent" value="save" variant="outline" pendingText="保存中…">下書きを保存</SubmitButton>
        <SubmitButton name="intent" value="submit" pendingText="依頼中…">保存して社長に承認を依頼</SubmitButton>
      </div>
    </ActionForm>
  );
}
