import type { Metadata } from "next";
import { NumbersView } from "@/components/company/NumbersView";

export const metadata: Metadata = { title: "数字（院別）" };

export default function NumbersPage() {
  return <NumbersView />;
}
