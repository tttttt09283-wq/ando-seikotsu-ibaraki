import type { Metadata } from "next";
import { ChadView } from "@/components/company/ChadView";

export const metadata: Metadata = { title: "CHAD COMMAND" };

export default function ChadPage() {
  return <ChadView />;
}
