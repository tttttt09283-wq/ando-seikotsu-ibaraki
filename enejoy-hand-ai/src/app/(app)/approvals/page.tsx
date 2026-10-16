import type { Metadata } from "next";
import { ApprovalsView } from "@/components/company/ApprovalsView";

export const metadata: Metadata = { title: "承認" };

export default function ApprovalsPage() {
  return <ApprovalsView />;
}
