import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth/admin";
import { authMode } from "@/lib/config";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "管理者ログイン", robots: { index: false, follow: false } };

export default async function LoginPage() {
  if (await getCurrentAdmin()) redirect("/admin");
  const mode = authMode();
  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <p className="font-serif text-[10px] tracking-brand text-mist">ADMIN</p>
      <h1 className="mb-8 font-serif text-xl tracking-[0.14em]">予約管理 ログイン</h1>
      {mode === "local" && (
        <p className="mb-6 border border-[#e6d3b0] bg-[#fbf6ec] px-3 py-2 text-xs text-warn">
          ローカル代替モード（Supabase Auth 未設定）。ADMIN_LOCAL_PASSWORD でログインします。本番では使えません。
        </p>
      )}
      <LoginForm mode={mode} />
    </main>
  );
}
