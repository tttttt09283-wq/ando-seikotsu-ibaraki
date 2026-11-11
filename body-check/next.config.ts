import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // LINE配信・QRコード用の短いURL：開くとすぐカラダ年齢チェック（/check）が始まる。
  // ?src= で「どこから開いたか」を集計できるようにする（/age＝LINE配信、/qr＝QRコード）
  async redirects() {
    return [
      { source: "/age", destination: "/check?src=line", permanent: false },
      { source: "/qr", destination: "/check?src=qr", permanent: false },
    ];
  },
};

export default nextConfig;
