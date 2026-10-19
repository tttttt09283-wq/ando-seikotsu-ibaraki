"use client";

import * as React from "react";
import { signInAction, signUpAction } from "@/app/login/actions";
import { Field, Input } from "@/components/ui/form";
import { Message, Submit } from "./ActionForm";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, action] = React.useActionState(mode === "login" ? signInAction : signUpAction, null);
  return (
    <form action={action} className="space-y-4">
      <Field label="メールアドレス">
        <Input type="email" name="email" autoComplete="email" required maxLength={254} />
      </Field>
      <Field label="パスワード" hint={mode === "signup" ? "8文字以上" : undefined}>
        <Input type="password" name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} maxLength={128} />
      </Field>
      <Submit className="w-full">{mode === "login" ? "ログイン" : "登録する"}</Submit>
      <Message state={state} />
    </form>
  );
}
