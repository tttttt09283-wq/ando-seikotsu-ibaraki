import type { Metadata } from "next";
import { Dashboard } from "@/components/company/Dashboard";

export const metadata: Metadata = { title: "CEO DASHBOARD" };

export default function HomePage() {
  return <Dashboard />;
}
