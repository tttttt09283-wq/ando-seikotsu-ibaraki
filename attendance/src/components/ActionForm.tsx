"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/errors";

type FormAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/**
 * Server Action を呼ぶフォーム。結果メッセージを表示し、成功時は入力をリセットする。
 * 権限・入力検証はすべてサーバー側（Server Action と DB）で行う。
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  confirmMessage,
  resetOnSuccess = true,
  className = "space-y-4",
  tone = "primary",
}: {
  action: FormAction;
  children?: ReactNode;
  submitLabel: string;
  confirmMessage?: string;
  resetOnSuccess?: boolean;
  className?: string;
  tone?: "primary" | "danger" | "secondary";
}) {
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className={className}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label={submitLabel} tone={tone} />
        {state && (
          <p role="status" className={`text-sm ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

const toneClass = {
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
  secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
};

function SubmitButton({ label, tone }: { label: string; tone: keyof typeof toneClass }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${toneClass[tone]}`}
    >
      {pending ? "処理中…" : label}
    </button>
  );
}
