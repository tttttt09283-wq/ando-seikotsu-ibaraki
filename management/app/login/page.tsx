import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { safeNext } from "@/lib/reauth";

export const metadata: Metadata = { title: "ログイン" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string; next?: string }> }) {
  const { e, next } = await searchParams;
  const notice = e === "inactive" ? "このアカウントは利用できません（未登録・退職・停止中）。社長に確認してください"
    : e === "reauth" ? "承認などの大事な操作の前に、本人確認のためもう一度ログインしてください（最後のログインから時間が経っています）" : undefined;
  return (
    <main className="mx-auto grid min-h-dvh max-w-sm content-center gap-6 px-4 py-10">
      <div className="text-center">
        <p className="text-xs font-bold tracking-widest text-brand-600">AND GROUP</p>
        <h1 className="text-xl font-black text-brand-800">MANAGEMENT SYSTEM</h1>
        <p className="mt-1 text-sm text-stone-600">あんど整骨院グループ 社内業務管理</p>
      </div>
      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <LoginForm notice={notice} next={next ? safeNext(next) : undefined} />
      </div>
      <p className="text-center text-xs text-stone-500">PASSを忘れた場合は、社長に再発行を依頼してください。</p>
    </main>
  );
}
