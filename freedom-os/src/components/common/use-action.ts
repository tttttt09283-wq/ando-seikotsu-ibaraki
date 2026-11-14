"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

type Result<T> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

/** Server Action を呼び、結果をトーストで知らせて画面を更新する */
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  function exec<T>(fn: () => Promise<Result<T>>, opts: { onOk?: (data: T | undefined) => void; silent?: boolean } = {}) {
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) {
          if (r.message && !opts.silent) toast.success(r.message);
          opts.onOk?.(r.data);
          router.refresh();
        } else toast.error(r.error);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "通信に失敗しました");
      }
    });
  }
  return { pending, exec };
}
