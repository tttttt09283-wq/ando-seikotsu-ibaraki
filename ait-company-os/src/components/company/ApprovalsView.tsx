"use client";

import { Check, PenLine, X } from "lucide-react";
import * as React from "react";
import { getMember } from "@/config/company";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { APPROVAL_CATEGORY_LABEL } from "@/config/approvals";
import { formatDateTime, formatJpy } from "@/lib/time";
import type { Approval } from "@/lib/types";
import { useCompany } from "./StateProvider";

const STATUS_LABEL: Record<Approval["status"], string> = {
  PENDING: "承認待ち",
  APPROVED: "承認済み",
  REJECTED: "却下",
  CHANGES_REQUESTED: "修正依頼",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_1fr] sm:gap-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-sm leading-relaxed whitespace-pre-wrap">{children}</dd>
    </div>
  );
}

function ApprovalCard({ a }: { a: Approval }) {
  const { mutate, openTask } = useCompany();
  const [comment, setComment] = React.useState("");
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const isPending = a.status === "PENDING";

  const decide = async (decision: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED") => {
    if (decision === "CHANGES_REQUESTED" && !comment.trim()) {
      setError("修正してほしい内容をコメント欄に入力してください");
      return;
    }
    setPending(decision);
    setError(null);
    const r = await mutate(`/api/approvals/${a.id}`, { decision, comment: comment.trim() || undefined });
    setPending(null);
    if (!r.ok) setError(r.error);
  };

  return (
    <Card className={isPending ? "border-amber-400 shadow-md" : "opacity-80"}>
      <CardHeader className="flex-wrap">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{APPROVAL_CATEGORY_LABEL[a.category]}</Badge>
            <Badge variant={isPending ? "default" : "secondary"}>{STATUS_LABEL[a.status]}</Badge>
            {a.mode === "demo" && <Badge variant="demo">DEMO</Badge>}
          </div>
          <CardTitle className="text-base leading-snug">{a.title}</CardTitle>
          <p className="text-muted-foreground text-xs">
            依頼：{getMember(a.requestedBy)?.name} ・ {formatDateTime(a.createdAt)}
            {a.decidedAt && ` ・ 判断：${formatDateTime(a.decidedAt)}`}
          </p>
        </div>
        {a.taskId && (
          <Button variant="link" size="sm" onClick={() => openTask(a.taskId!)}>
            元のTaskを見る
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="space-y-3">
          <Row label="実行内容">
            <span className="bg-secondary/60 block rounded-lg p-3">{a.action}</span>
          </Row>
          <Row label="目的">{a.purpose}</Row>
          <Row label="想定効果">{a.expectedEffect}</Row>
          <Row label="費用">{a.costJpy > 0 ? `${formatJpy(a.costJpy)}／月` : "追加費用なし"}</Row>
          <Row label="リスク">{a.risk}</Row>
          <Row label="CHADの推奨理由">{a.chadRecommendation}</Row>
          {a.ceoComment && <Row label="CEOコメント">{a.ceoComment}</Row>}
        </dl>
        {isPending && (
          <div className="space-y-3 border-t pt-4">
            {a.mode === "demo" && (
              <p className="text-muted-foreground text-xs">DEMO MODEでは、承認しても実際の外部送信・投稿・支払いは行われません。</p>
            )}
            <Textarea
              value={comment}
              maxLength={500}
              onChange={(e) => setComment(e.target.value)}
              placeholder="コメント（修正依頼の場合は必須）"
              aria-label="CEOコメント"
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => decide("APPROVED")} disabled={pending !== null} className="bg-emerald-600 text-white hover:bg-emerald-700">
                <Check aria-hidden /> 承認する
              </Button>
              <Button variant="outline" onClick={() => decide("CHANGES_REQUESTED")} disabled={pending !== null}>
                <PenLine aria-hidden /> 修正を依頼
              </Button>
              <Button variant="outline" onClick={() => decide("REJECTED")} disabled={pending !== null} className="text-red-600">
                <X aria-hidden /> 却下
              </Button>
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ApprovalsView() {
  const { snapshot } = useCompany();
  const pending = snapshot.approvals.filter((a) => a.status === "PENDING");
  const done = snapshot.approvals.filter((a) => a.status !== "PENDING");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">HUMAN APPROVAL</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          SNS投稿・外部送信・顧客への提案・契約・支払い・予算変更・AI社員の追加・重要データの削除・外部サービスへの書き込みは、CEOの承認なしには実行されません。
        </p>
      </div>
      <section className="space-y-4">
        <h2 className="font-semibold">承認待ち（{pending.length}）</h2>
        {pending.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">判断が必要なものはありません。</p>
        ) : (
          pending.map((a) => <ApprovalCard key={a.id} a={a} />)
        )}
      </section>
      {done.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-semibold">判断済み</h2>
          {done.map((a) => (
            <ApprovalCard key={a.id} a={a} />
          ))}
        </section>
      )}
    </div>
  );
}
