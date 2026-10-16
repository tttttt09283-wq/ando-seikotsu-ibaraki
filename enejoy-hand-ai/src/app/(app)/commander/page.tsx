import type { Metadata } from "next";
import { CommanderView } from "@/components/company/CommanderView";

export const metadata: Metadata = { title: "司令塔との会話" };

export default function CommanderPage() {
  return <CommanderView />;
}
