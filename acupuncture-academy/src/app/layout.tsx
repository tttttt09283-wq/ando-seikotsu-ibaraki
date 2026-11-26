import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LearningProvider } from "@/lib/learning-store";
import { SiteHeader } from "@/components/layout/site-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import Link from "next/link";
import { contentVersion } from "@/data/changelog";

export const metadata: Metadata = {
  title: { default: "鍼灸臨床アカデミー", template: "%s｜鍼灸臨床アカデミー" },
  description: "東洋医学の基礎から神経難病への臨床応用まで、病態と取穴の根拠を段階的に学ぶ鍼灸師のための学習アプリ。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e3a6b",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body className="min-h-dvh">
        <LearningProvider>
          <SiteHeader />
          <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-8">{children}</main>
          <footer className="mx-auto w-full max-w-6xl px-4 pb-24 text-xs text-muted-foreground lg:pb-10">
            教材データ {contentVersion.replaceAll("-", "/")} 版 ・{" "}
            <Link href="/updates" className="underline">
              更新情報
            </Link>{" "}
            ・ 全教材「要確認（未監修）」
          </footer>
          <BottomNav />
        </LearningProvider>
      </body>
    </html>
  );
}
