"use client";

import * as React from "react";
import { APPROVAL_CATEGORY_LABEL } from "@/config/approvals";
import { getMember, OPERATOR_ID, PRESIDENT_ID } from "@/tenant";
import { ApprovalCard } from "./ApprovalCard";
import { useCompany } from "./StateProvider";

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">{children}</p>;
}

/** 統括責任者の承認画面：自分の判断待ち／代表の判断待ち／判断済み */
export function ApprovalsView() {
  const { snapshot, mutate, openTask } = useCompany();
  const mine = snapshot.approvals.filter((a) => a.status === "PENDING" && a.currentApprover === "operator");
  const president = snapshot.approvals.filter((a) => a.status === "PENDING" && a.currentApprover === "president");
  const done = snapshot.approvals.filter((a) => a.status !== "PENDING");
  const decide = async (id: string, decision: Parameters<React.ComponentProps<typeof ApprovalCard>["decide"]>[1], comment?: string) => {
    const r = await mutate(`/api/approvals/${id}`, { decision, comment });
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  };
  const retry = async (approvalId: string) => {
    const r = await mutate("/api/reputation/retry", { approvalId });
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">承認</h1>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
          {Object.values(APPROVAL_CATEGORY_LABEL).join("・")}は、承認なしには実行・確定されません。
          承認依頼はまず{getMember(OPERATOR_ID)?.name}さんに届きます。司令塔の推奨を見て、ご自身で判断するか、代表 {getMember(PRESIDENT_ID)?.name}さんへ回してください。
        </p>
      </div>
      <section className="space-y-4">
        <h2 className="font-semibold">あなたの判断待ち（{mine.length}）</h2>
        {mine.length === 0 ? <Empty>判断が必要なものはありません。</Empty> : mine.map((a) => <ApprovalCard key={a.id} a={a} viewer="operator" decide={decide} onOpenTask={openTask} />)}
      </section>
      <section className="space-y-4">
        <h2 className="font-semibold">代表の判断待ち（{president.length}）</h2>
        {president.length === 0 ? (
          <Empty>代表に回している依頼はありません。</Empty>
        ) : (
          president.map((a) => <ApprovalCard key={a.id} a={a} viewer="operator" decide={decide} onOpenTask={openTask} />)
        )}
      </section>
      {done.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-semibold">判断済み</h2>
          {done.map((a) => (
            <ApprovalCard key={a.id} a={a} viewer="operator" decide={decide} onOpenTask={openTask} onRetry={retry} />
          ))}
        </section>
      )}
    </div>
  );
}
