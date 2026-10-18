/**
 * 共用端末（キオスク）モードの入口。
 * 管理画面へのリンク・管理画面のセッションは一切使わない。端末登録・PIN 認証・打刻はフェーズ3で実装する。
 */
export const metadata = { title: "打刻端末 | あんど整骨院グループ" };

export default function KioskPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-navy-900 px-6 text-center text-white">
      <p className="text-sm tracking-widest text-brand-200">あんど整骨院グループ</p>
      <h1 className="mt-2 text-3xl font-bold">打刻端末</h1>
      <p className="mt-6 text-base text-slate-200">この端末はまだ登録されていません。</p>
      <p className="mt-1 text-sm text-slate-400">本部事務に端末登録を依頼してください。</p>
    </main>
  );
}
