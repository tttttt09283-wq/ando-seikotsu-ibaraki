"use client";
import { useState } from "react";
import { decideLeave } from "@/app/(app)/leave/actions";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { REJECT_CATEGORIES } from "@/lib/leave/requests";

// 承認・差戻し・却下。差戻し・却下は理由が必須（空では送れない）。有給の却下は理由の区分も必須
export function DecisionForm({ stepId, version, kind, idempotencyKey, backTo, disabledApprove, selfApproval }: {
  stepId: string; version: number; kind: "PAID" | "SHIFT"; idempotencyKey: string; backTo: string; disabledApprove?: string; selfApproval?: boolean;
}) {
  const [mode, setMode] = useState<"approve" | "return" | "reject" | null>(null);
  const hidden = (
    <>
      <input type="hidden" name="step_id" value={stepId} /><input type="hidden" name="version" value={version} />
      <input type="hidden" name="idempotency_key" value={idempotencyKey} /><input type="hidden" name="back_to" value={backTo} />
    </>
  );
  if (mode === "return" || mode === "reject") {
    return (
      <form action={decideLeave} className="grid gap-2 rounded-lg border border-stone-200 bg-stone-50 p-3">
        {hidden}<input type="hidden" name="action" value={mode} />
        {mode === "reject" && kind === "PAID" ? (
          <Field label="却下の理由の区分（必須）">
            <Select name="reason_category" required defaultValue=""><option value="" disabled>選択</option>{REJECT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>
          </Field>
        ) : null}
        <Field label={`${mode === "return" ? "差戻し" : "却下"}の理由（必須・申請者に届きます）`}><Input name="reason" required minLength={2} maxLength={500} autoFocus /></Field>
        <div className="flex gap-2">
          <SubmitButton variant={mode === "reject" ? "danger" : "default"}>{mode === "return" ? "差戻す" : "却下する"}</SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setMode(null)}>やめる</Button>
        </div>
      </form>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={decideLeave} onSubmit={(e) => { if (!confirm(selfApproval ? "ご自身の振休を承認します（GM・社長に通知されます）。よろしいですか？" : "承認しますか？")) e.preventDefault(); }}>
        {hidden}<input type="hidden" name="action" value="approve" />
        <SubmitButton disabled={!!disabledApprove} title={disabledApprove}>{selfApproval ? "本人承認する" : "承認"}</SubmitButton>
      </form>
      <Button type="button" variant="outline" onClick={() => setMode("return")}>差戻し</Button>
      <Button type="button" variant="ghost" className="text-red-700" onClick={() => setMode("reject")}>却下</Button>
      {disabledApprove ? <span className="text-xs text-red-700">{disabledApprove}</span> : null}
    </div>
  );
}
