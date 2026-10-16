import type { Metadata } from "next";
import { OrganizationView } from "@/components/company/OrganizationView";

export const metadata: Metadata = { title: "組織図" };

export default function OrganizationPage() {
  return <OrganizationView />;
}
