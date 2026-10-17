import type { Metadata } from "next";
import { SnsPosts } from "@/components/sales/SnsPosts";

export const metadata: Metadata = { title: "SNS投稿文テンプレート｜あんど式 カラダ年齢チェック" };

export default function SnsPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-bold tracking-widest text-brand-600">SNS TEMPLATES</p>
        <h1 className="mt-1 text-3xl font-black text-navy-900">SNS投稿文テンプレート</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-700">
          Instagram・LINE配信・X・Googleビジネスプロフィールにそのまま使える文例です。院名・URL・特典を入れて、「コピー」ボタンで貼り付けてください。
        </p>
      </header>
      <SnsPosts />
    </div>
  );
}
