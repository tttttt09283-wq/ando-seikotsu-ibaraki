import type { Metadata } from "next";
import Link from "next/link";
import { salesConfig } from "@/config/sales";
import { PersonalizeProvider } from "@/components/sales/Personalize";
import { SalesNav } from "@/components/sales/SalesNav";

export const metadata: Metadata = {
  title: `${salesConfig.productName}｜整骨院・治療院向け 導入のご案内`,
  description:
    "LINEから3分でできるセルフ身体チェック。結果（カラダ年齢・スコア）をそのまま予約につなげる、整骨院・治療院向けの集客ツールです。デモ・活用手順・導入ガイド・SNS投稿文・店頭テンプレートを公開しています。",
  robots: { index: true, follow: true },
};

export default function ForClinicsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PersonalizeProvider>
      <div className="flex min-h-dvh flex-col bg-brand-50">
        <header className="no-print bg-gradient-to-r from-navy-900 to-brand-700 text-white">
          <div className="mx-auto max-w-5xl space-y-3 px-4 py-4">
            <Link href="/for-clinics" className="block">
              <span className="text-xs font-bold tracking-widest text-sun-300">FOR CLINICS｜整骨院・治療院向け</span>
              <span className="mt-0.5 block text-lg font-black sm:text-xl">{salesConfig.productName}</span>
            </Link>
            <SalesNav />
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-10">{children}</main>
        <footer className="no-print border-t border-brand-100 bg-white px-4 py-6 text-center text-xs leading-relaxed text-slate-600">
          <p>
            {salesConfig.productName}　開発・提供：{salesConfig.vendorName}
          </p>
          <p className="mt-1">本ツールのチェック・スコアは医療診断ではありません。独自の参考指標です。</p>
          <p className="mt-1">
            <Link href="/privacy" className="underline underline-offset-4">
              プライバシーと利用目的について
            </Link>
          </p>
        </footer>
      </div>
    </PersonalizeProvider>
  );
}
