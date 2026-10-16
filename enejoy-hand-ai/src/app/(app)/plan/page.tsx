import type { Metadata } from "next";
import { Suspense } from "react";
import { PlanView } from "@/components/company/PlanView";

export const metadata: Metadata = { title: "事業計画" };

export default function PlanPage() {
  return (
    <Suspense>
      <PlanView />
    </Suspense>
  );
}
