import path from "node:path";
import type { NextConfig } from "next";

// 予約管理と同じログイン（院ID・個人PASS）と台帳の読み込みは、リポジトリ直下の ../lib をそのまま使う。
// そのため、ビルドの基準をリポジトリ直下にする（Vercel の「Include files outside the root directory」を ON のまま）
const repoRoot = path.resolve(process.cwd(), "..");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
