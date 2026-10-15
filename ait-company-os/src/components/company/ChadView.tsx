"use client";

import { RotateCcw, Sparkles } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatJpy } from "@/lib/time";
import { CommandBox } from "./CommandBox";
import { CommandThread } from "./CommandThread";
import { useCompany } from "./StateProvider";

function ChadIntro() {
  return (
    <div className="flex gap-3">
      <span className="bg-chad text-chad-foreground mt-1 grid size-8 shrink-0 place-items-center rounded-full">
        <Sparkles className="size-4" aria-hidden />
      </span>
      <div className="bg-card max-w-[46rem] rounded-2xl rounded-tl-sm border px-4 py-3 text-sm leading-relaxed">
        <div className="mb-1 text-xs font-semibold">CHAD</div>
        <p>CEO、CHADです。あなたの指示を、会社全体の行動に変換します。</p>
        <p className="mt-2">
          指示をいただくと、意図の分析 → MISSION・KPIの確認 → 優先順位の決定 → Project作成 → Task分解 → 担当役員・AI社員への割当 → 実行 → マネージャーのレビュー → 成果の集約 → CEOへの報告、までを一気に進めます。
        </p>
        <p className="mt-2">無駄な会議や業務は増やしません。必要なら反対意見も言います。日本語・英語でどうぞ。</p>
      </div>
    </div>
  );
}

function CoreStatus() {
  const { snapshot, runtime, mutate } = useCompany();
  const [pending, setPending] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const k = snapshot.kpis;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">CHAD CORE の状態</CardTitle>
        <Badge variant={runtime.mode === "demo" ? "demo" : "secondary"}>{runtime.mode === "demo" ? "DEMO MODE" : "本番"}</Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground text-xs leading-relaxed">{runtime.reason}</p>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Claude API</dt>
          <dd>{runtime.claudeKeyConfigured ? "キー設定済み" : "未設定"}</dd>
          <dt className="text-muted-foreground">Supabase</dt>
          <dd>{runtime.supabaseConfigured ? "設定済み" : "未設定"}</dd>
          <dt className="text-muted-foreground">保存先</dt>
          <dd className="truncate">{runtime.storage}</dd>
          <dt className="text-muted-foreground">AI予算（日／月）</dt>
          <dd>
            {formatJpy(k.dailyBudgetJpy)}／{formatJpy(k.monthlyBudgetJpy)}
          </dd>
          <dt className="text-muted-foreground">安全状態</dt>
          <dd>{snapshot.safety.halted ? "停止中" : "正常"}</dd>
        </dl>
        {runtime.mode === "demo" && (
          <div className="border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={async () => {
                if (!window.confirm("デモデータ（指示・Task・ログ・承認）をすべて消去して最初からやり直しますか？")) return;
                setPending(true);
                const r = await mutate("/api/system/reset-demo");
                setMsg(r.ok ? "デモを初期化しました" : r.error);
                setPending(false);
              }}
            >
              <RotateCcw aria-hidden /> デモを最初からやり直す
            </Button>
            {msg && <p className="text-muted-foreground mt-2 text-xs">{msg}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ChadView() {
  const { snapshot } = useCompany();
  const commands = [...snapshot.commands].reverse();
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CHAD COMMAND</h1>
          <p className="text-muted-foreground mt-1 text-sm">CEOの指示を、会社全体の行動に変換する中央司令塔</p>
        </div>
        <CommandBox autoFocus />
        <div className="space-y-10">
          {commands.length === 0 && <ChadIntro />}
          {commands.map((c) => (
            <CommandThread key={c.id} command={c} />
          ))}
        </div>
      </div>
      <aside className="space-y-4">
        <CoreStatus />
      </aside>
    </div>
  );
}
