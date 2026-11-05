import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-[60dvh] max-w-sm content-center gap-3 px-4 text-center">
      <h1 className="text-lg font-black text-brand-800">ページが見つからないか、見る権限がありません</h1>
      <Link href="/" className="font-bold text-brand-700">ホームへ戻る</Link>
    </main>
  );
}
