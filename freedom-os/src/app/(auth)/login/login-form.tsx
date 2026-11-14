"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction, signOutAction, signUpAction, type AuthState } from "../actions";

export function LoginForm({ notAllowed }: { notAllowed: boolean }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "in" ? signInAction : signUpAction, {});
  return (
    <Card>
      <CardContent className="space-y-4">
        {notAllowed && (
          <div className="rounded-md bg-status-red/10 p-3 text-sm text-status-red">
            このアカウントは利用が許可されていません。
            <form action={signOutAction} className="mt-2">
              <Button size="sm" variant="outline" type="submit">別のアカウントでログイン</Button>
            </form>
          </div>
        )}
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">メールアドレス</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">パスワード（8文字以上）</Label>
            <Input id="password" name="password" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} minLength={8} required />
          </div>
          {state.error && <p className="text-sm text-status-red" role="alert">{state.error}</p>}
          {state.message && <p className="text-sm text-status-green" role="status">{state.message}</p>}
          <Button className="w-full" type="submit" disabled={pending}>
            {pending ? "処理中…" : mode === "in" ? "ログイン" : "新規登録"}
          </Button>
        </form>
        <button type="button" className="text-muted-foreground w-full text-center text-sm underline-offset-4 hover:underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "はじめての方：新規登録" : "登録済みの方：ログイン"}
        </button>
      </CardContent>
    </Card>
  );
}
