import Link from "next/link";
import { CenteredCard } from "@/components/brand";

export default function NotFound() {
  return (
    <CenteredCard title="ページが見つかりません">
      <p className="text-sm text-muted-foreground">URL が正しいか、アクセス権限があるかをご確認ください。</p>
      <p className="mt-4 text-sm">
        <Link href="/select-org" className="text-primary hover:underline">
          トップに戻る
        </Link>
      </p>
    </CenteredCard>
  );
}
