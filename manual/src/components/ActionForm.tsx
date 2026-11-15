"use client";
import { useActionState } from "react";
import type { FormState } from "@/app/actions";

// サーバーの処理を呼び、結果（エラー・完了）をフォームの下に出す
export function ActionForm({
  action,
  children,
  className = "",
  confirmText,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
  confirmText?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {pending && <p className="mt-2 text-sm text-neutral-500">処理中…</p>}
      {state?.error && <p role="alert" className="mt-2 whitespace-pre-wrap rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-800">{state.error}</p>}
      {state?.ok && <p role="status" className="mt-2 whitespace-pre-wrap rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{state.ok}</p>}
    </form>
  );
}
