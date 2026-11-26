import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { PointExplorer } from "./point-explorer";

export const metadata: Metadata = { title: "経穴辞典" };

export default function PointsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="POINT DICTIONARY"
        title="経穴辞典"
        description="WHO標準コード・位置・取穴・局所解剖・要穴分類・主治・配穴・安全上の注意をまとめています。十四経の要穴（五兪穴・原穴・絡穴・郄穴・背部兪穴・募穴・八会穴・下合穴・八脈交会穴・四総穴）をすべて収録。作用・主治・局所解剖まで載せた詳細版と、名称・部位・分類・安全上の注意を載せた簡易版があります。"
      />
      <PointExplorer />
    </div>
  );
}
