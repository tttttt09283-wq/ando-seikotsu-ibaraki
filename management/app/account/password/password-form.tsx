"use client";
import { useActionState } from "react";
import { changePassword, type PasswordState } from "./actions";
import { Input, Field } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/submit-button";
import { ActionForm } from "@/components/action-form";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, {});
  return (
    <ActionForm action={action} pending={pending} className="grid gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="新しいPASS" htmlFor="password" hint="8文字以上・英字と数字を両方入れる。POSのPASSも同じものに変わります">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="新しいPASS（確認）" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <SubmitButton pendingText="変更中…">PASSを変更する</SubmitButton>
    </ActionForm>
  );
}
