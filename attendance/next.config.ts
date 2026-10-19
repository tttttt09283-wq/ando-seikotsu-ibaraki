import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // 有給残数の Excel 取込（最大5MB）
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
