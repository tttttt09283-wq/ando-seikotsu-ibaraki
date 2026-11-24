import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { ReviewSession } from "./review-session";

export const metadata: Metadata = { title: "復習" };

export default function ReviewPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="REVIEW"
        title="復習"
        description="間違えた問題と完了した講義を、間隔をあけて繰り返し復習します。正解するたびに次の復習までの間隔が延び（1→3→7→14→30日）、間違えると最初に戻ります。"
      />
      <ReviewSession />
    </div>
  );
}
