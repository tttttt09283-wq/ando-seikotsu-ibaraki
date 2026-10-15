"use client";

import { FlaskConical, LoaderCircle } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";

export function LoginForm({ passcodeRequired, configError }: { passcodeRequired: boolean; configError: string | null }) {
  const [passcode, setPasscode] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(configError);

  const login = async (body: Record<string, unknown>) => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "ログインできませんでした");
        setPending(false);
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch {
      setError("通信に失敗しました");
      setPending(false);
    }
  };

  return (
    <div className="bg-card space-y-4 rounded-2xl border p-6 shadow-sm">
      {passcodeRequired ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void login({ passcode });
          }}
        >
          <label htmlFor="passcode" className="text-sm font-medium">
            CEOパスコード
          </label>
          <input
            id="passcode"
            type="password"
            autoComplete="current-password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="focus-visible:ring-ring/50 h-10 w-full rounded-md border bg-transparent px-3 text-base outline-none focus-visible:ring-[3px]"
            required
          />
          <Button type="submit" className="w-full" size="lg" disabled={pending || !passcode}>
            {pending && <LoaderCircle className="animate-spin" aria-hidden />}
            ログイン
          </Button>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="bg-demo/20 flex gap-2 rounded-lg p-3 text-sm">
            <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              パスコードが未設定のため、<strong>DEMO MODE</strong>で入場します。表示される成果・稼働状況はすべてデモデータです。
            </p>
          </div>
          <Button className="w-full" size="lg" variant="chad" disabled={pending || Boolean(configError)} onClick={() => login({ demo: true })}>
            {pending && <LoaderCircle className="animate-spin" aria-hidden />}
            CEOとしてデモに入る
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
