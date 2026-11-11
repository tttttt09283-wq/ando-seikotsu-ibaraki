import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // LINE配信・QRコード用の短いURL：/age を開くと、すぐカラダ年齢チェック（/check）が始まる
  async redirects() {
    return [{ source: "/age", destination: "/check", permanent: false }];
  },
};

export default nextConfig;
