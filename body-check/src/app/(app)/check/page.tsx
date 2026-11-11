import type { Metadata } from "next";
import { CheckFlow } from "@/components/check/CheckFlow";

/** LINE配信・QRコードで送るURL。開くとすぐ最初の質問（年齢など）から始まります */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://ando-body-check.vercel.app").replace(/\/$/, "");
const TITLE = "あなたの姿勢・体幹は何歳？｜あんど式 カラダ年齢チェック";
const DESCRIPTION = "片足立ち・プランク・前屈・スクワットの4つでチェック。スマホで約3分・無料・登録なし。あんど整骨院 香里園院";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  // LINEなどでURLを送ったときに出るカード（画像・タイトル・説明）
  openGraph: {
    type: "website",
    url: "/check",
    title: "あなたの姿勢・体幹は何歳？",
    description: DESCRIPTION,
    siteName: "あんど式 カラダ年齢チェック",
    locale: "ja_JP",
    images: [{ url: "/og-check.png", width: 1200, height: 630, alt: "あなたの姿勢・体幹は何歳？ 無料・約3分・登録なし" }],
  },
  twitter: { card: "summary_large_image", title: "あなたの姿勢・体幹は何歳？", description: DESCRIPTION, images: ["/og-check.png"] },
};

export default function CheckPage() {
  return <CheckFlow />;
}
