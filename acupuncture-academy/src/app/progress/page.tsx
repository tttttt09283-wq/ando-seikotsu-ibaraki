import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { ProgressView } from "./progress-view";

export const metadata: Metadata = { title: "学習記録" };

export default function ProgressPage() {
  return (
    <div>
      <PageHeader eyebrow="LEARNING RECORD" title="学習記録" description="講義の完了状況、テスト結果、間違えた経穴、苦手な理論、復習予定、週ごとの成長を確認できます。" />
      <ProgressView />
    </div>
  );
}
