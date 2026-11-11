import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "A.I.T Follow Manager", template: "%s｜A.I.T Follow Manager" },
  description: "顧客フォロー管理",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f1e3d",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // CSP の nonce を適用するため、全ページをリクエスト時に描画する（proxy.ts で nonce を発行）
  await headers();
  return (
    <html lang="ja">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
