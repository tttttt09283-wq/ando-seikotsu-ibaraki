"use client";

import { useActionState, useEffect, useId, useRef } from "react";

export type ActionState = { ok: boolean; message: string } | null;
type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * 管理者操作のフォーム。
 *  - 送信前に確認ダイアログを表示する
 *  - 処理中はボタンを無効化（二重送信防止）。サーバー側でもバージョン照合で二重操作を拒否する
 */
export default function ActionForm({
  action,
  hidden = {},
  label,
  confirmTitle,
  confirmMessage,
  tone = "default",
  children,
  className = "",
  confirm = true,
}: {
  action: Action;
  hidden?: Record<string, string | number>;
  label: string;
  confirmTitle?: string;
  confirmMessage?: string;
  tone?: "default" | "primary" | "danger";
  children?: React.ReactNode;
  className?: string;
  confirm?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const dialog = useRef<HTMLDialogElement>(null);
  const formId = useId();
  useEffect(() => {
    if (state) dialog.current?.close();
  }, [state]);

  const btn = {
    default: "border border-ink text-ink hover:bg-stone",
    primary: "border border-ink bg-ink text-paper hover:bg-ink-soft",
    danger: "border border-ng text-ng hover:bg-[#fbf1f1]",
  }[tone];

  return (
    <form id={formId} action={formAction} className={`space-y-3 ${className}`}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={String(v)} />
      ))}
      {children}
      {confirm ? (
        <button type="button" disabled={pending} onClick={() => dialog.current?.showModal()} className={`w-full px-4 py-2.5 text-sm disabled:opacity-50 ${btn}`}>
          {pending ? "処理中…" : label}
        </button>
      ) : (
        <button type="submit" disabled={pending} className={`w-full px-4 py-2.5 text-sm disabled:opacity-50 ${btn}`}>
          {pending ? "処理中…" : label}
        </button>
      )}
      {state && <p className={`text-xs ${state.ok ? "text-ok" : "text-ng"}`}>{state.message}</p>}
      {confirm && (
        <dialog ref={dialog} className="m-auto w-[min(92vw,420px)] border border-line bg-paper p-0 text-ink">
          <div className="space-y-3 p-5">
            <p className="font-serif text-base">{confirmTitle ?? `${label}してよろしいですか？`}</p>
            {confirmMessage && <p className="whitespace-pre-wrap text-sm text-ink-soft">{confirmMessage}</p>}
          </div>
          <div className="flex gap-2 border-t border-line p-3">
            <button type="button" onClick={() => dialog.current?.close()} className="flex-1 border border-line px-4 py-2.5 text-sm">
              やめる
            </button>
            <button type="submit" form={formId} disabled={pending} className={`flex-1 px-4 py-2.5 text-sm disabled:opacity-50 ${btn}`}>
              {pending ? "処理中…" : "実行する"}
            </button>
          </div>
        </dialog>
      )}
    </form>
  );
}
