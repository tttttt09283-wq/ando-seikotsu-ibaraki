import type { Metadata } from "next";
import { Suspense } from "react";
import { ReputationView } from "@/components/company/ReputationView";

export const metadata: Metadata = { title: "口コミ・MEO" };

export default function ReputationPage() {
  return (
    <Suspense>
      <ReputationView />
    </Suspense>
  );
}
