import type { Metadata } from "next";
import { ActivityView } from "@/components/company/ActivityView";

export const metadata: Metadata = { title: "活動ログ" };

export default function ActivityPage() {
  return <ActivityView />;
}
