"use client";

import { ArrowUpRight, Check, ChevronDown, CornerUpLeft, Crown, PenLine, X } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { APPROVAL_CATEGORY_LABEL } from "@/config/approvals";
import { formatDateTime, formatJpy } from "@/lib/time";
import type { Approval, ApprovalDecision, ApprovalEvent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getMember, OPERATOR_ID, PRESIDENT_ID } from "@/tenant";

export const APPROVAL_STATUS_LABEL: Record<Approval["status"], string> = {
  PENDING: "判断待ち",
  APPROVED: "承認済み",
  REJECTED: "却下",
  CHANGES_REQUESTED: "修正依頼",
};

const EVENT_LABEL: Record<ApprovalEvent["action"], string> = {
  REQUESTED: "依頼",
  ESCALATED: "代表へ回す",
  RETURNED: "統括責任者に任せる",
  APPROVED: "承認",
  REJECTED: "却下",
  CHANGES_REQUESTED: "修正依頼",
};

const operatorName = getMember(OPERATOR_ID)?.name ?? "統括責任者";
const presidentName = getMember(PRESIDENT_ID)?.name ?? "代表";
export const approverLabel = (r: Approval["currentApprover"]) =>
  r === "president" ? `代表 ${presidentName}` : `統括責任者 ${operatorName}`;

function Row({ label, children, emphasize }: { label: string; children: React.ReactNode; emphasize?: boolean }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_1fr] sm:gap-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className={cn("text-sm leading-relaxed whitespace-pre-wrap", emphasize && "font-medium")}>{children}</dd>
    </div>
  );
}

/** 長い実行内容（成果物）は、スマホで素早く判断できるよう最初は折りたたむ */
function Collapsible({ text }: { text: string }) {
  const [open, setOpen] = React.useState(false);
  const long = text.split("\n").length > 8 || text.length > 400;
  return (
    <div className="bg-secondary/60 rounded-lg p-3">
      <div className={cn("whitespace-pre-wrap", !open && long && "line-clamp-[8]")}>{text}</div>
      {long && (
        <button type="button" className="text-brand mt-2 inline-flex items-center gap-1 text-xs font-medium" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <ChevronDown className={cn("size-3.5 transition", open && "rotate-180")} aria-hidden />
          {open ? "閉じる" : "全文を見る"}
        </button>
      )}
    </div>
  );
}

export type ApprovalViewer = "operator" | "president";

/**
 * 承認依頼のカード。viewer によって、押せるボタンが変わる。
 * - 統括責任者：承認（代表の決裁が必須なら不可）／修正依頼／却下／代表へ回す
 * - 代表：承認／修正依頼／却下／統括責任者に任せる（代表の決裁が必須のものは不可）
 */
export function ApprovalCard({
  a,
  viewer,
  decide,
  onOpenTask,
  compact,
}: {
  a: Approval;
  viewer: ApprovalViewer;
  decide: (id: string, decision: ApprovalDecision, comment?: string) => Promise<{ ok: boolean; error?: string }>;
  onOpenTask?: (taskId: string) => void;
  compact?: boolean;
}) {
  const [comment, setComment] = React.useState("");
  const [pending, setPending] = React.useState<ApprovalDecision | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const isPending = a.status === "PENDING";
  const myTurn = isPending && a.currentApprover === viewer;
  const requester = getMember(a.requestedBy)?.name ?? a.requestedBy;

  const run = async (decision: ApprovalDecision) => {
    if (decision === "CHANGES_REQUESTED" && !comment.trim()) {
      setError("修正してほしい内容をコメント欄に入力してください");
      return;
    }
    setPending(decision);
    setError(null);
    const r = await decide(a.id, decision, comment.trim() || undefined);
    setPending(null);
    if (!r.ok) setError(r.error ?? "処理できませんでした");
    else setComment("");
  };

  return (
    <Card className={cn(myTurn ? "border-amber-400 shadow-md" : !isPending && "opacity-85")}>
      <CardHeader className="flex-wrap">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{APPROVAL_CATEGORY_LABEL[a.category]}</Badge>
            <Badge variant={myTurn ? "default" : "secondary"}>
              {isPending ? `${approverLabel(a.currentApprover)}の判断待ち` : APPROVAL_STATUS_LABEL[a.status]}
            </Badge>
            {a.presidentRequired && (
              <Badge variant="outline" className="border-amber-500 text-amber-800 dark:text-amber-300">
                <Crown className="size-3" aria-hidden /> 代表の決裁が必須
              </Badge>
            )}
            {a.mode === "demo" && <Badge variant="demo">DEMO</Badge>}
          </div>
          <CardTitle className="text-base leading-snug">{a.title}</CardTitle>
          <p className="text-muted-foreground text-xs">
            依頼：{requester} ・ {formatDateTime(a.createdAt)}
            {a.decidedAt && ` ・ 判断：${getMember(a.decidedBy ?? "")?.name ?? ""} ${formatDateTime(a.decidedAt)}`}
          </p>
        </div>
        {a.taskId && onOpenTask && (
          <Button variant="link" size="sm" onClick={() => onOpenTask(a.taskId!)}>
            元のTaskを見る
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={cn(
            "rounded-lg border p-3 text-sm",
            a.recommendedApprover === "president" ? "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30" : "bg-secondary/40",
          )}
        >
          <div className="font-semibold">
            司令塔の推奨承認者：{a.recommendedApprover === "president" ? `代表 ${presidentName}` : `統括責任者 ${operatorName}`}
          </div>
          <div className="text-muted-foreground mt-0.5 leading-relaxed">{a.approverReason}</div>
        </div>
        <dl className="space-y-3">
          <Row label="実行内容">
            <Collapsible text={a.action} />
          </Row>
          {!compact && <Row label="目的">{a.purpose}</Row>}
          <Row label="想定効果">{a.expectedEffect}</Row>
          <Row label="費用" emphasize>
            {a.costJpy > 0 ? `${formatJpy(a.costJpy)}${a.category === "new_agent" ? "／月" : ""}` : "追加費用なし"}
          </Row>
          <Row label="リスク">{a.risk}</Row>
          <Row label="司令塔の推奨理由">{a.commanderRecommendation}</Row>
          {a.decisionComment && <Row label="判断コメント">{a.decisionComment}</Row>}
        </dl>

        <details className="text-xs">
          <summary className="text-muted-foreground cursor-pointer">記録（誰がいつ何をしたか：{a.history.length}件）</summary>
          <ol className="mt-2 space-y-1">
            {a.history.map((h, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className="text-muted-foreground tabular-nums">{formatDateTime(h.at)}</span>
                <span className="font-medium">{getMember(h.actor)?.name ?? h.actor}</span>
                <span>{EVENT_LABEL[h.action]}</span>
                {h.comment && <span className="text-muted-foreground">「{h.comment}」</span>}
              </li>
            ))}
          </ol>
        </details>

        {myTurn && (
          <div className="space-y-3 border-t pt-4">
            {a.mode === "demo" && (
              <p className="text-muted-foreground text-xs">DEMO MODEでは、承認しても実際の外部送信・投稿・支払い・確定の反映は行われません。</p>
            )}
            {viewer === "operator" && a.presidentRequired && (
              <p className="text-sm text-amber-800 dark:text-amber-300">
                この依頼は代表の決裁が必須です。内容を確認して「代表へ回す」を押してください（却下・修正依頼はできます）。
              </p>
            )}
            {viewer === "operator" && !a.presidentRequired && a.recommendedApprover === "president" && (
              <p className="text-muted-foreground text-xs">司令塔は代表の決裁を推奨しています。ご自身で判断することもできます。</p>
            )}
            <Textarea
              value={comment}
              maxLength={500}
              onChange={(e) => setComment(e.target.value)}
              placeholder={viewer === "operator" ? "コメント（修正依頼の場合は必須・代表へ回すときの申し送りにも使えます）" : "コメント（修正依頼の場合は必須）"}
              aria-label="判断コメント"
            />
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {!(viewer === "operator" && a.presidentRequired) && (
                <Button onClick={() => run("APPROVED")} disabled={pending !== null} size="lg" className="bg-emerald-600 text-white hover:bg-emerald-700">
                  <Check aria-hidden /> 承認する
                </Button>
              )}
              {viewer === "operator" && (
                <Button onClick={() => run("ESCALATE")} disabled={pending !== null} size="lg" variant={a.presidentRequired || a.recommendedApprover === "president" ? "default" : "outline"}>
                  <ArrowUpRight aria-hidden /> 代表へ回す
                </Button>
              )}
              <Button variant="outline" size="lg" onClick={() => run("CHANGES_REQUESTED")} disabled={pending !== null}>
                <PenLine aria-hidden /> 修正を依頼
              </Button>
              <Button variant="outline" size="lg" onClick={() => run("REJECTED")} disabled={pending !== null} className="text-red-600">
                <X aria-hidden /> 却下
              </Button>
              {viewer === "president" && !a.presidentRequired && (
                <Button variant="ghost" size="lg" onClick={() => run("RETURN")} disabled={pending !== null}>
                  <CornerUpLeft aria-hidden /> 統括責任者に任せる
                </Button>
              )}
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
