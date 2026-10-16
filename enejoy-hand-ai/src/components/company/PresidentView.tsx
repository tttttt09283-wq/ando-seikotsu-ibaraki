"use client";

import { Crown, FlaskConical, LogOut, Target, TrendingUp, WifiOff } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApprovalDecision } from "@/lib/types";
import type { PresidentSnapshot } from "@/lib/view";
import { getMember, PRESIDENT_ID, TENANT } from "@/tenant";
import { ApprovalCard, APPROVAL_STATUS_LABEL } from "./ApprovalCard";
import { formatOku } from "./RevenuePanel";
import { APPROVAL_CATEGORY_LABEL } from "@/config/approvals";
import { formatDateTime } from "@/lib/time";

const PRESIDENT = getMember(PRESIDENT_ID)!;
const POLL_MS = 10_000;

/**
 * 代表 村上の承認画面。自分宛ての承認依頼だけを表示し、スマートフォンで短時間に判断できることを重視する。
 */
export function PresidentView({ initial }: { initial: PresidentSnapshot }) {
  const [snap, setSnap] = React.useState(initial);
  const [offline, setOffline] = React.useState(false);

  const apply = React.useCallback((data: { president?: PresidentSnapshot }) => {
    if (data.president) setSnap(data.president);
    setOffline(false);
  }, []);

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      apply(await res.json());
    } catch {
      setOffline(true);
    }
  }, [apply]);

  React.useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const decide = async (id: string, decision: ApprovalDecision, comment?: string) => {
    try {
      const res = await fetch(`/api/approvals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        window.location.href = "/login";
        return { ok: false, error: "ログインが必要です" };
      }
      if (!res.ok) return { ok: false, error: (data as { error?: string }).error ?? `エラー（${res.status}）` };
      apply(data);
      return { ok: true };
    } catch {
      return { ok: false, error: "通信に失敗しました。もう一度お試しください。" };
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <div className="min-h-dvh">
      {snap.mode === "demo" && (
        <div className="bg-demo text-demo-foreground flex items-center justify-center gap-2 px-4 py-1.5 text-center text-xs font-semibold">
          <FlaskConical className="size-3.5 shrink-0" aria-hidden />
          DEMO MODE ― 表示中の承認依頼はデモデータです。承認しても実際の送信・確定は行われません。
        </div>
      )}
      {offline && (
        <div className="flex items-center justify-center gap-2 bg-slate-800 px-4 py-1.5 text-xs text-white">
          <WifiOff className="size-3.5" aria-hidden /> サーバーと通信できません。自動で再接続します。
        </div>
      )}
      <main className="mx-auto max-w-2xl space-y-6 px-4 pt-5 pb-16">
        <header className="flex items-start justify-between gap-3">
          <div>
            <div className="text-muted-foreground text-xs">{TENANT.company.name}</div>
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <Crown className="text-brand size-5" aria-hidden />
              代表 {PRESIDENT.name}さんの承認
            </h1>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} aria-label="ログアウト">
            <LogOut />
          </Button>
        </header>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card rounded-xl border p-3">
            <div className="text-muted-foreground flex items-center gap-1 text-xs">
              <Target className="size-3.5" aria-hidden /> {snap.mission.code}
              {snap.mode === "demo" && <Badge variant="demo" className="ml-auto px-1 py-0 text-[10px]">DEMO</Badge>}
            </div>
            <div className="mt-1 text-xl font-bold tabular-nums">{snap.mission.percent}%</div>
            <div className="text-muted-foreground line-clamp-2 text-[11px]">{snap.mission.title}</div>
          </div>
          <div className="bg-card rounded-xl border p-3">
            <div className="text-muted-foreground flex items-center gap-1 text-xs">
              <TrendingUp className="size-3.5" aria-hidden /> {snap.revenue.label}
            </div>
            <div className="mt-1 text-xl font-bold tabular-nums">{snap.revenue.hasData ? formatOku(snap.revenue.actualJpy) : "未入力"}</div>
            <div className="text-muted-foreground text-[11px]">
              {snap.revenue.hasData ? `実績（累計） ・ 着地見込み ${formatOku(snap.revenue.landingJpy)}（${snap.revenue.landingPercent}%）` : "数字の取り込み待ち"}
            </div>
          </div>
        </div>

        <section className="space-y-3" aria-label="判断待ち">
          <h2 className="text-lg font-semibold">
            判断待ち <span className="tabular-nums">{snap.pending.length}</span>件
          </h2>
          {snap.pending.length === 0 ? (
            <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
              今、代表の判断が必要なものはありません。
            </p>
          ) : (
            snap.pending.map((a) => <ApprovalCard key={a.id} a={a} viewer="president" decide={decide} compact />)
          )}
        </section>

        {snap.decided.length > 0 && (
          <section className="space-y-2" aria-label="最近の判断">
            <h2 className="text-muted-foreground text-sm font-semibold">最近の判断</h2>
            <ul className="divide-y rounded-xl border text-sm">
              {snap.decided.map((a) => (
                <li key={a.id} className="flex items-start gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{a.title}</div>
                    <div className="text-muted-foreground text-xs">
                      {APPROVAL_CATEGORY_LABEL[a.category]} ・ {formatDateTime(a.decidedAt ?? a.createdAt)}
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {a.status === "PENDING" ? "統括責任者に任せた" : APPROVAL_STATUS_LABEL[a.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="text-muted-foreground text-center text-xs">「{TENANT.company.philosophy}」― {TENANT.company.philosophyNote}</p>
      </main>
    </div>
  );
}
