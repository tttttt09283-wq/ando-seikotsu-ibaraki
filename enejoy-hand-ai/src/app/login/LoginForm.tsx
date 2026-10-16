"use client";

import { Crown, FlaskConical, LoaderCircle, UserRound } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getMember, OPERATOR_ID, PRESIDENT_ID } from "@/tenant";

type Role = "operator" | "president";

const ROLES: { id: Role; label: string; sub: string; icon: typeof Crown }[] = [
  { id: "operator", label: getMember(OPERATOR_ID)?.name ?? "統括責任者", sub: "AI部門 統括責任者（指示・承認）", icon: UserRound },
  { id: "president", label: getMember(PRESIDENT_ID)?.name ?? "代表", sub: "代表取締役（代表宛ての承認のみ）", icon: Crown },
];

export function LoginForm({
  passcodeRequired,
  presidentAvailable,
  configError,
}: {
  passcodeRequired: boolean;
  presidentAvailable: boolean;
  configError: string | null;
}) {
  const [role, setRole] = React.useState<Role>("operator");
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
      if (data.role === "president") {
        window.location.href = "/president";
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/president") ? next : "/";
    } catch {
      setError("通信に失敗しました");
      setPending(false);
    }
  };

  const roles = ROLES.filter((r) => r.id === "operator" || presidentAvailable);

  return (
    <div className="bg-card space-y-4 rounded-2xl border p-6 shadow-sm">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">ログインする人</legend>
        {roles.map((r) => (
          <label
            key={r.id}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition",
              role === r.id ? "border-brand bg-brand/5" : "hover:bg-accent",
            )}
          >
            <input type="radio" name="role" value={r.id} checked={role === r.id} onChange={() => setRole(r.id)} className="sr-only" />
            <r.icon className={cn("size-5", role === r.id ? "text-brand" : "text-muted-foreground")} aria-hidden />
            <span>
              <span className="block text-sm font-semibold">{r.label}</span>
              <span className="text-muted-foreground block text-xs">{r.sub}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {passcodeRequired ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void login({ role, passcode });
          }}
        >
          <label htmlFor="passcode" className="text-sm font-medium">
            パスコード
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
              パスコードが未設定のため、<strong>DEMO MODE</strong>で入場します。AI部門の成果・稼働状況はすべてデモデータ（架空）です。
            </p>
          </div>
          <Button className="w-full" size="lg" variant="brand" disabled={pending || Boolean(configError)} onClick={() => login({ role, demo: true })}>
            {pending && <LoaderCircle className="animate-spin" aria-hidden />}
            {role === "president" ? "代表としてデモに入る" : "統括責任者としてデモに入る"}
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
