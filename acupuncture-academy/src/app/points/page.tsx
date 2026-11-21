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
        description="WHO標準コード・位置・取穴・局所解剖・要穴分類・主治・配穴・安全上の注意をまとめています。現在は八脈交会穴8穴と、原穴・合穴・下合穴などの要穴を中心に15穴を収録。"
      />
      <PointExplorer />
    </div>
  );
}
