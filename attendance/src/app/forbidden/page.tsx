import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-bold">この画面を表示する権限がありません</h1>
        <p className="mt-2 text-sm text-slate-600">権限が必要な場合は本部事務にご連絡ください。</p>
        <Link href="/" className="mt-6 inline-block text-sm text-brand-700 underline">
          ホームへ戻る
        </Link>
      </div>
    </main>
  );
}
