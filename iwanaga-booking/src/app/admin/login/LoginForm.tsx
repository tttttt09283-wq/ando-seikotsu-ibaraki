"use client";

import { useActionState } from "react";
import { loginAction } from "../actions";

export default function LoginForm({ mode }: { mode: "supabase" | "local" }) {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-4">
      {mode === "supabase" && (
        <label className="block text-sm">
          メールアドレス
          <input name="email" type="email" autoComplete="username" required className="mt-1 w-full border border-line px-3 py-3" />
        </label>
      )}
      <label className="block text-sm">
        パスワード
        <input name="password" type="password" autoComplete="current-password" required className="mt-1 w-full border border-line px-3 py-3" />
      </label>
      <button disabled={pending} className="w-full bg-ink px-4 py-3 text-sm tracking-[0.2em] text-paper disabled:opacity-50">
        {pending ? "確認しています…" : "ログイン"}
      </button>
      {state && !state.ok && <p className="text-sm text-ng">{state.message}</p>}
    </form>
  );
}
