import type { Metadata } from "next";
import { Suspense } from "react";
import { ShareLanding } from "@/components/share/ShareLanding";
import { siteConfig } from "@/config/site";

/** 結果をシェアされた人が開くページ（/s?ref=紹介コード）。LINE友だち追加をしてからチェックを始める */
const DESCRIPTION = "片足立ち・プランク・前屈・スクワットの4つでチェック。スマホで約3分・無料。あんど整骨院 香里園院";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title: "あなたの姿勢・体幹は何歳？｜あんど式 カラダ年齢チェック",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    url: "/s",
    title: "あなたの姿勢・体幹は何歳？",
    description: DESCRIPTION,
    siteName: "あんど式 カラダ年齢チェック",
    locale: "ja_JP",
    images: [{ url: "/og-check.png", width: 1200, height: 630, alt: "あなたの姿勢・体幹は何歳？" }],
  },
};

export default function SharePage() {
  return (
    <Suspense>
      <ShareLanding />
    </Suspense>
  );
}
