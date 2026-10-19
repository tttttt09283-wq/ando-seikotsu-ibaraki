"use client";

import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import * as React from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ActionResult = { ok: boolean; message: string } | null;
type Action = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;

export function Message({ state }: { state: ActionResult }) {
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={cn("flex items-start gap-1.5 text-sm", state.ok ? "text-good" : "text-bad")}>
      {state.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
      {state.message}
    </p>
  );
}

export function Submit({ children, variant, size, className }: { children: React.ReactNode; variant?: React.ComponentProps<typeof Button>["variant"]; size?: React.ComponentProps<typeof Button>["size"]; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={variant} size={size} className={className}>
      {pending && <LoaderCircle className="animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}

/** Server Action のフォーム。結果のメッセージを表示し、成功したら入力を空にする（resetOnSuccess） */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  confirmText,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirmText?: string;
}) {
  const [state, formAction] = React.useActionState(action, null);
  const ref = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
      <div className="mt-2 empty:hidden">
        <Message state={state} />
      </div>
    </form>
  );
}
