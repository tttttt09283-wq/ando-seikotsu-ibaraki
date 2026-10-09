import Link from "next/link";
import { buttonStyles } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-5 py-16 text-center">
      <p className="text-5xl" aria-hidden="true">
        🧭
      </p>
      <h1 className="text-2xl font-black">ページが見つかりません</h1>
      <p className="text-base text-slate-700">URLが変更されたか、削除された可能性があります。</p>
      <Link href="/" className={buttonStyles.primary}>
        トップページへ
      </Link>
    </main>
  );
}
