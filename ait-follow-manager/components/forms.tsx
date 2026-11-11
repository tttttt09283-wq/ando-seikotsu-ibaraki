"use client";

import * as React from "react";
import { createContext, startTransition, useActionState, useContext } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ActionState = { ok?: boolean; message?: string; error?: string; fieldErrors?: Record<string, string> };
type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

const PendingContext = createContext(false);

export function SubmitButton({ children, pendingText = "処理中…", ...props }: ButtonProps & { pendingText?: string }) {
  const status = useFormStatus();
  const pending = useContext(PendingContext) || status.pending;
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? pendingText : children}
    </Button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <div role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
        {state.error}
        {state.fieldErrors && (
          <ul className="mt-1 list-disc pl-5 font-normal">
            {Object.entries(state.fieldErrors).map(([k, v]) => (
              <li key={k}>{v}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  if (state.ok && state.message) {
    return (
      <div role="status" className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success">
        {state.message}
      </div>
    );
  }
  return null;
}

/** Server Action を実行し、結果メッセージを表示するフォーム */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  confirmMessage,
  ...props
}: Omit<React.ComponentProps<"form">, "action"> & {
  action: Action;
  resetOnSuccess?: boolean;
  confirmMessage?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <PendingContext value={pending}>
      <form
        ref={ref}
        className={cn("grid gap-3", className)}
        onSubmit={(e) => {
          // React 19 の form action は送信後に入力を自動でリセットするため、
          // 入力エラー時に内容が消えないよう手動で送信する（押したボタンの name/value も送る）
          e.preventDefault();
          if (pending) return;
          if (confirmMessage && !window.confirm(confirmMessage)) return;
          const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          startTransition(() => formAction(fd));
        }}
        {...props}
      >
        {children}
        <FormMessage state={state} />
      </form>
    </PendingContext>
  );
}
