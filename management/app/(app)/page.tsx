import { redirect } from "next/navigation";
import { requireMe } from "@/server/session";
import { homePathFor } from "@/lib/roles";

// ログイン後は役職に合わせた画面へ
export default async function Home() {
  const me = await requireMe();
  redirect(homePathFor(me));
}
