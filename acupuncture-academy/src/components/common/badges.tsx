import { AlertTriangle, BadgeCheck, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { KnowledgeKind, ReviewStatus } from "@/data/types";

const reviewLabel: Record<ReviewStatus, string> = {
  unverified: "要確認（未監修）",
  "in-review": "監修中",
  verified: "監修済み",
};

export function ReviewStatusBadge({ status, short = false }: { status: ReviewStatus; short?: boolean }) {
  if (status === "verified")
    return (
      <Badge variant="ok">
        <BadgeCheck />
        {reviewLabel[status]}
      </Badge>
    );
  if (status === "in-review")
    return (
      <Badge variant="secondary">
        <Clock3 />
        {reviewLabel[status]}
      </Badge>
    );
  return (
    <Badge variant="verify">
      <AlertTriangle />
      {short ? "要確認" : reviewLabel[status]}
    </Badge>
  );
}

export const kindLabel: Record<KnowledgeKind, string> = {
  traditional: "伝統的主治",
  modern: "現代医学的な病態",
  research: "臨床研究",
};

export function KindBadge({ kind }: { kind: KnowledgeKind }) {
  const variant = kind === "traditional" ? "secondary" : kind === "modern" ? "outline" : "ok";
  return <Badge variant={variant}>{kindLabel[kind]}</Badge>;
}
