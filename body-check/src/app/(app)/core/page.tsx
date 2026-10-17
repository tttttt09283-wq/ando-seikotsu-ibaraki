import type { Metadata } from "next";
import { CoreCheck } from "@/components/tools/CoreCheck";

export const metadata: Metadata = { title: "体幹チェック" };

export default function CorePage() {
  return <CoreCheck />;
}
