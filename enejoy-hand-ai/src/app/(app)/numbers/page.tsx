import type { Metadata } from "next";
import { Suspense } from "react";
import { NumbersView } from "@/components/company/NumbersView";

export const metadata: Metadata = { title: "数字（院別）" };

export default function NumbersPage() {
  return (
    <Suspense>
      <NumbersView />
    </Suspense>
  );
}
