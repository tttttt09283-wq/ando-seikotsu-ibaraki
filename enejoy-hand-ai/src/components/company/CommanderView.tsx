"use client";

import { RotateCcw } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatJpy } from "@/lib/time";
import { CommandBox } from "./CommandBox";
import { CommandThread } from "./CommandThread";
import { CommanderIcon } from "./MemberParts";
import { COMMANDER_ID, getMember, OPERATOR_ID, TENANT } from "@/tenant";

const COMMANDER = getMember(COMMANDER_ID)!;
import { useCompany } from "./StateProvider";

function CommanderIntro() {
  return (
    <div className="flex gap-3">
      <CommanderIcon className="mt-1" />
      <div className="bg-card max-w-[46rem] rounded-2xl rounded-tl-sm border px-4 py-3 text-sm leading-relaxed">
        <div className="mb-1 text-xs font-semibold">{COMMANDER.name}（司令塔）</div>
        <p>{getMember(OPERATOR_ID)?.name.split(" ")[0]}さん、司令塔の{COMMANDER.name}です。いただいた指示を、AI部門の仕事に変えて進めます。</p>
        <p className="mt-2">
          指示の意図を読み取り、MISSION 001と{TENANT.revenueTarget.label}への効き方を確認して優先順位を決めます。そのうえで、Projectを作ってTaskに分け、担当者に割り当てます。担当者の成果物はリーダーがレビューし、私がまとめて報告します。
        </p>
        <p className="mt-2">
          SNS投稿・外部への送信・支払い・スタッフ評価の確定などは、必ず承認をいただいてから実行します。誰の承認が適切か（{getMember(OPERATOR_ID)?.name.split(" ")[0]}さんか、代表か）も、毎回理由をつけて提案します。必要なら反対意見も言います。
        </p>
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
        <CardTitle className="text-sm">AI部門の稼働状態</CardTitle>
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
                if (!window.confirm("デモデータ（指示・Task・ログ・承認）をすべて消去して最初からやり直しますか？（手入力した売上の実績は消えません）")) return;
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

function InfoCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">司令塔 {COMMANDER.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs leading-relaxed">
        <p>{COMMANDER.persona}</p>
        <div>
          <div className="mb-1 font-semibold">データ連携の候補（実装は承認後）</div>
          <ul className="text-muted-foreground list-disc space-y-1 pl-4">
            {TENANT.dataSources.map((d) => (
              <li key={d.name}>
                <span className="text-foreground">{d.name}</span>：{d.status}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-1 font-semibold">個人情報・機密情報の扱い</div>
          <ul className="text-muted-foreground list-disc space-y-1 pl-4">
            {TENANT.privacy.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export function CommanderView() {
  const { snapshot } = useCompany();
  const commands = [...snapshot.commands].reverse();
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">司令塔との会話</h1>
          <p className="text-muted-foreground mt-1 text-sm">指示を、AI部門の判断・Project・Task・報告に変換します</p>
        </div>
        <CommandBox autoFocus />
        <div className="space-y-10">
          {commands.length === 0 && <CommanderIntro />}
          {commands.map((c) => (
            <CommandThread key={c.id} command={c} />
          ))}
        </div>
      </div>
      <aside className="space-y-4">
        <CoreStatus />
        <InfoCard />
      </aside>
    </div>
  );
}
