import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "あんど整骨院グループ 社内マニュアル", template: "%s｜あんど社内マニュアル" },
  description: "株式会社Enjoy Hand あんど整骨院グループの会社ルール・マニュアル",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1e2a4a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
