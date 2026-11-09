"use client";
import { createContext, startTransition, useContext } from "react";

const PendingContext = createContext(false);
export const useActionPending = () => useContext(PendingContext);

// useActionState のフォーム。React 19 はフォームの action に関数を渡すと処理のあとでフォームを初期化し、
// エラーで戻ったときに選んだ値（セレクト・ラジオ・チェック）が画面だけ初期値に戻ってしまう。
// ここでは送信を自分で行い、初期化させない（送信中はボタンを押せない：SubmitButton が useActionPending を見る）
export function ActionForm({ action, pending, confirmMessage, children, ...props }:
  Omit<React.FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit"> & { action: (fd: FormData) => void; pending: boolean; confirmMessage?: string }) {
  return (
    <PendingContext.Provider value={pending}>
      <form
        {...props}
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          if (confirmMessage && !confirm(confirmMessage)) return;
          const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          startTransition(() => action(fd));
        }}
      >
        {children}
      </form>
    </PendingContext.Provider>
  );
}
