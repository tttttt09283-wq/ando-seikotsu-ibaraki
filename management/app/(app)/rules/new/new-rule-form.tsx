"use client";
import { useActionState } from "react";
import { createRule, type RuleFormState } from "../actions";
import { Input, Field } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/submit-button";
import { ActionForm } from "@/components/action-form";
import { RuleFields } from "@/components/rule-fields";

export function NewRuleForm() {
  const [state, action, pending] = useActionState<RuleFormState, FormData>(createRule, {});
  return (
    <ActionForm action={action} pending={pending} className="grid gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <div className="w-40"><Field label="規定番号（3けた）"><Input name="rule_no" required pattern="\d{3}" inputMode="numeric" placeholder="006" /></Field></div>
      <RuleFields title="" body={"## 目的\n\n## 対象\n\n## 内容\n"} applies={{}} effective={null} provisional={false} />
      <div><SubmitButton pendingText="作成中…">下書きを作る</SubmitButton></div>
    </ActionForm>
  );
}
