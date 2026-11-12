import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // 管理画面・予約完了ページは検索エンジンに出さない
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] },
      { source: "/reserve/status", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
  // SNS 別の短縮URL（流入元の集計用）
  async redirects() {
    return [
      { source: "/th", destination: "/reserve?src=threads", permanent: false },
      { source: "/ig", destination: "/reserve?src=instagram", permanent: false },
      { source: "/link", destination: "/reserve?src=profile", permanent: false },
    ];
  },
};

export default nextConfig;
