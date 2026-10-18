import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { homePathFor } from "@/lib/auth/permissions";

export default async function HomePage() {
  const actor = await requireActor();
  redirect(homePathFor(actor));
}
