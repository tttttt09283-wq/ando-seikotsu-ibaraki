import type { Metadata, Viewport } from "next";
import { Zen_Maru_Gothic } from "next/font/google";
import { siteConfig } from "@/config/site";
import "./globals.css";

const maru = Zen_Maru_Gothic({
  weight: ["500", "700", "900"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-maru",
  preload: false,
});

export const metadata: Metadata = {
  title: `${siteConfig.serviceName}｜${siteConfig.clinicName}`,
  description: "たった3分！おうちでできる無料カラダチェック。5つの簡単なチェックで、あなたの身体のコンディションを見える化します。",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#14a8b5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={maru.variable}>
      <body className="min-h-dvh antialiased">
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">{children}</div>
      </body>
    </html>
  );
}
