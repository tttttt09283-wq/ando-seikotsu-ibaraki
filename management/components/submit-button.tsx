"use client";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useActionPending } from "@/components/action-form";

// 送信中は押せないボタン（二度押し防止）
export function SubmitButton({ children, pendingText = "処理中…", ...props }: ButtonProps & { pendingText?: string }) {
  const status = useFormStatus();
  const actionPending = useActionPending();
  const pending = status.pending || actionPending;
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? pendingText : children}
    </Button>
  );
}
