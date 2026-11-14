import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "ログイン" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const s = await getSession();
  if (s.ok) redirect("/");
  if (!s.ok && s.reason === "unconfigured") redirect("/setup");
  const notAllowed = sp.error === "not_allowed" || (!s.ok && s.reason === "not_allowed");
  return (
    <div className="bg-sidebar flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-white">
          <div className="text-2xl font-bold tracking-wider">FREEDOM OS</div>
          <p className="mt-1 text-sm text-white/60">夢を数字に、数字を行動に、行動を独立に。</p>
        </div>
        <LoginForm notAllowed={notAllowed} />
      </div>
    </div>
  );
}
