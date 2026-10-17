import type { Metadata } from "next";
import { StoreTemplates } from "@/components/sales/StoreTemplates";

export const metadata: Metadata = { title: "店頭での案内テンプレート｜あんど式 カラダ年齢チェック" };

export default function TemplatesPage() {
  return (
    <div className="space-y-8">
      <header className="no-print">
        <p className="text-xs font-bold tracking-widest text-brand-600">IN-STORE TEMPLATES</p>
        <h1 className="mt-1 text-3xl font-black text-navy-900">店頭での案内テンプレート</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-700">
          A4ポスター・卓上カードの印刷用データと、受付・来院時・提案・フォローのトーク台本です。院名・URL・特典を入れると、QRコードと文章に自動で反映されます。
        </p>
      </header>
      <StoreTemplates />
    </div>
  );
}
