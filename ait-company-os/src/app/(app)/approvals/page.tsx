import type { Metadata } from "next";
import { ApprovalsView } from "@/components/company/ApprovalsView";

export const metadata: Metadata = { title: "HUMAN APPROVAL" };

export default function ApprovalsPage() {
  return <ApprovalsView />;
}
