import type { Metadata } from "next";
import { Dashboard } from "@/components/company/Dashboard";

export const metadata: Metadata = { title: "ダッシュボード" };

export default function HomePage() {
  return <Dashboard />;
}
