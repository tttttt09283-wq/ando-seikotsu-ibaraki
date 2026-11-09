"use client";
import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";
import { Input, Field } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/submit-button";
import { ActionForm } from "@/components/action-form";
import { useFields } from "@/components/use-fields";

export function LoginForm({ notice, next }: { notice?: string; next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  const { bind } = useFields();
  return (
    <ActionForm action={action} pending={pending} className="grid gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {notice ? <Alert tone="warn">{notice}</Alert> : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="ログインID" htmlFor="login_id" hint="POSと同じIDです（例：tanaka）">
        <Input id="login_id" {...bind("login_id")} autoComplete="username" autoCapitalize="none" inputMode="email" required />
      </Field>
      <Field label="PASS" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton pendingText="確認中…">ログイン</SubmitButton>
    </ActionForm>
  );
}
