import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "岩永拓己 鍼灸 | ご予約", template: "%s | 岩永拓己 鍼灸" },
  description: "岩永拓己の鍼灸 ご予約フォーム。ご予約は公式LINEでの受付確認後、内容を確認して確定のご連絡をいたします。",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
