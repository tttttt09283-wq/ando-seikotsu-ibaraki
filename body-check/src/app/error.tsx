"use client";

/** 予期しないエラーが起きたときの画面（アプリ全体が真っ白になるのを防ぎます） */
import Link from "next/link";
import { useEffect } from "react";
import { buttonStyles } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-5 py-16 text-center">
      <p className="text-5xl" aria-hidden="true">
        🙇
      </p>
      <h1 className="text-2xl font-black">うまく表示できませんでした</h1>
      <p className="text-base text-slate-700">通信状況をご確認のうえ、もう一度お試しください。</p>
      <button type="button" onClick={reset} className={buttonStyles.primary}>
        もう一度試す
      </button>
      <Link href="/" className={buttonStyles.secondary}>
        トップページへ
      </Link>
    </main>
  );
}
