import { redirect } from "next/navigation";
import { loginDev } from "@/app/actions";
import { btnGhost, input } from "@/components/ui";
import { devLoginEnabled, getActor } from "@/lib/auth";
import { sql } from "@/lib/db";
import { LoginForms } from "./LoginForms";

export const metadata = { title: "ログイン" };

export default async function LoginPage() {
  if (await getActor().catch(() => null)) redirect("/");
  const dev = devLoginEnabled() ? await sql()<{ id: string; name: string }[]>`select id, name from mn_members where is_active order by name` : null;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <div className="text-xs font-bold tracking-widest text-neutral-500">株式会社Enjoy Hand</div>
        <h1 className="mt-1 text-2xl font-bold text-navy">あんど整骨院グループ</h1>
        <p className="mt-1 text-sm text-neutral-700">社内ルール・マニュアル</p>
      </div>
      <LoginForms />
      {dev && (
        <form action={loginDev} className="mt-8 space-y-2 rounded-lg border border-dashed border-amber-500 p-3">
          <p className="text-xs font-bold text-amber-800">開発用ログイン（本番では表示されません）</p>
          <select name="member" className={input}>
            {dev.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button className={`${btnGhost} w-full`}>この人でログイン</button>
        </form>
      )}
      <p className="mt-10 text-center text-xs leading-relaxed text-neutral-500">
        私たちは、会社に関わる全ての人を、物心共に豊かに笑顔で幸せにすることを追求します。
      </p>
    </main>
  );
}
