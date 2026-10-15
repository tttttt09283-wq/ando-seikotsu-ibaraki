import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";
import { getAuthConfig } from "@/lib/auth/session";

export const metadata: Metadata = { title: "ログイン" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const cfg = getAuthConfig();
  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--chad)_14%,transparent),transparent_60%)] px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="text-muted-foreground text-xs tracking-[0.3em]">AI COMPANY OPERATING SYSTEM</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">A.I.T company OS</h1>
          <p className="text-muted-foreground mt-2 text-sm">「自由に、自分たちが楽しい。」</p>
        </div>
        <LoginForm passcodeRequired={cfg.ok && cfg.passcodeRequired} configError={cfg.ok ? null : cfg.error} />
      </div>
    </main>
  );
}
