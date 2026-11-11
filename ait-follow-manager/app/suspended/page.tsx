import Link from "next/link";
import { CenteredCard } from "@/components/brand";

export const metadata = { title: "利用停止中" };

export default function SuspendedPage() {
  return (
    <CenteredCard title="この組織は利用停止中です">
      <p className="text-sm text-muted-foreground">ご利用を再開するには、A.I.T company までお問い合わせください。</p>
      <p className="mt-4 text-sm">
        <Link href="/select-org" className="text-primary hover:underline">
          組織の選択に戻る
        </Link>
      </p>
    </CenteredCard>
  );
}
