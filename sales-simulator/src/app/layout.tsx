import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "整骨院 総売上シミュレーター",
  description: "カルテ数・保険対応数・自費売上から月間総売上をリアルタイムに試算する経営ツール",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#172c4f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
