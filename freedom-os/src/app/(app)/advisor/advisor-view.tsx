"use client";
import { useState } from "react";
import { Check, Plus, Sparkles, Trash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { useAction } from "@/components/common/use-action";
import type { AdvisorOutput, InsightKind } from "@/lib/types";
import { jstDateTime } from "@/lib/format";
import { approveAdvice, deleteInsight, runAdvisorAction } from "../actions";

const KINDS: { v: InsightKind; label: string }[] = [
  { v: "weekly", label: "週間振り返り" },
  { v: "monthly", label: "月間経営レビュー" },
  { v: "gap", label: "目標と実績の差分分析" },
  { v: "bottleneck", label: "ボトルネック特定" },
  { v: "timing", label: "独立時期の見直し" },
  { v: "time", label: "時間配分の改善提案" },
];
const kindLabel = (k: string) => KINDS.find((x) => x.v === k)?.label ?? k;

interface Insight { id: string; kind: InsightKind; source: "llm" | "rules"; model: string; created_at: string; output: AdvisorOutput; approved: number[] }

export function AdvisorView({ configured, live, insights, payloadPreview }: { configured: boolean; live: AdvisorOutput; insights: Insight[]; payloadPreview: string }) {
  const [kind, setKind] = useState<InsightKind>("weekly");
  const [showPayload, setShowPayload] = useState(false);
  const { pending, exec } = useAction();
  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as InsightKind)} className="w-auto" aria-label="分析の種類">
              {KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}
            </NativeSelect>
            <Button disabled={pending} onClick={() => exec(() => runAdvisorAction(kind))}>
              <Sparkles />{pending ? "分析中…（最大1分ほど）" : configured ? "AIで分析する" : "ルールベースで分析を保存"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowPayload(!showPayload)}>{showPayload ? "送信データを閉じる" : "AIに送るデータを確認"}</Button>
          </div>
          <p className="text-muted-foreground text-xs">送るのは事業KPI・目標・独立条件・タスク名・週間レビューの課題欄のみです。患者の氏名・症状・施術記録は送りません（このシステムには保存されていません）。</p>
          {showPayload && <pre className="bg-muted max-h-72 overflow-auto rounded-lg p-3 text-[11px]">{payloadPreview}</pre>}
        </CardContent>
      </Card>

      <OutputCard title="いまの分析（ルールベース・自動更新）" output={live} />

      <h2 className="font-semibold">分析履歴</h2>
      {insights.length === 0 && <p className="text-muted-foreground text-sm">まだ保存された分析はありません。</p>}
      {insights.map((i) => (
        <OutputCard
          key={i.id}
          title={`${kindLabel(i.kind)}（${jstDateTime(i.created_at)}）`}
          badge={i.source === "llm" ? `AI：${i.model}` : "ルールベース"}
          output={i.output}
          approved={i.approved}
          onApprove={(idx) => exec(() => approveAdvice(i.id, idx))}
          onDelete={() => confirm("この分析を削除しますか？") && exec(() => deleteInsight(i.id))}
          pending={pending}
        />
      ))}
    </div>
  );
}

function OutputCard({ title, badge, output, approved, onApprove, onDelete, pending }: { title: string; badge?: string; output: AdvisorOutput; approved?: number[]; onApprove?: (i: number) => void; onDelete?: () => void; pending?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {badge && <CardDescription><Badge variant="secondary">{badge}</Badge></CardDescription>}
        {onDelete && <CardAction><Button size="sm" variant="ghost" onClick={onDelete} aria-label="削除"><Trash /></Button></CardAction>}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <section>
          <h3 className="text-primary mb-1 text-xs font-bold">【現状】</h3>
          <p className="leading-relaxed">{output.current}</p>
        </section>
        <section>
          <h3 className="text-primary mb-1 text-xs font-bold">【最大の課題】</h3>
          <ul className="space-y-1.5">{output.issues.map((x, k) => <li key={k}><b>{x.title}</b><div className="text-muted-foreground">{x.detail}</div></li>)}</ul>
        </section>
        <section>
          <h3 className="text-primary mb-1 text-xs font-bold">【推奨行動】今週</h3>
          <ol className="space-y-2">
            {output.actions.map((a, k) => (
              <li key={k} className="flex items-start justify-between gap-3 rounded-lg border p-2.5">
                <div className="min-w-0">
                  <div className="font-medium">{k + 1}. {a.title}{a.mandala_code && <Badge variant="outline" className="ml-1">{a.mandala_code}</Badge>}</div>
                  <div className="text-muted-foreground text-xs">{a.purpose}・{a.estimate_minutes}分・{a.due_in_days}日以内</div>
                  {a.done_criteria && <div className="text-muted-foreground text-xs">完了条件：{a.done_criteria}</div>}
                </div>
                {onApprove && (approved?.includes(k) ? (
                  <Badge variant="green"><Check />登録済み</Badge>
                ) : (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => onApprove(k)}><Plus />承認してタスクへ</Button>
                ))}
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h3 className="text-primary mb-1 text-xs font-bold">【期待する変化】</h3>
          <ul className="space-y-1">{output.expected.map((x, k) => <li key={k}>{x.metric}：{x.target}<span className="text-muted-foreground">（検証：{x.verification}）</span></li>)}</ul>
        </section>
        <section>
          <h3 className="text-primary mb-1 text-xs font-bold">【注意点】</h3>
          <ul className="text-muted-foreground space-y-0.5 text-xs">{output.cautions.map((c, k) => <li key={k}>・{c}</li>)}</ul>
        </section>
      </CardContent>
    </Card>
  );
}
