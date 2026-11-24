import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { MeridianMap } from "./meridian-map";

export const metadata: Metadata = { title: "経絡マップ" };

export default function MeridiansPage() {
  return (
    <div>
      <PageHeader
        eyebrow="MERIDIAN MAP"
        title="インタラクティブ経絡マップ"
        description="前面・後面・側面を切り替え、十二経脈の走行・流注・表裏関係を確認できます。経絡の線を選ぶと詳細、経穴の点をタップすると経穴の詳細が開きます。"
      />
      <MeridianMap />
    </div>
  );
}
