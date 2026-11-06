"use client";
import { useActionState, useState } from "react";
import { commitStaff, type StaffImportState } from "../actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";

// スタッフの一括登録。発行したPASSはこの画面に1回だけ表示する
export function StaffCommit({ batchId, disabled }: { batchId: string; disabled: boolean }) {
  const [state, action] = useActionState<StaffImportState, FormData>(commitStaff, {});
  const [copied, setCopied] = useState(false);
  if (state.results) {
    const ok = state.results.filter((r) => !r.error);
    const text = ok.map((r) => `${r.name}\t${r.loginId}\t${r.password ?? "（POSと同じPASS）"}`).join("\n");
    return (
      <div className="grid gap-3">
        <Alert tone={ok.length === state.results.length ? "ok" : "warn"}>{ok.length}人を登録しました{state.results.length - ok.length ? `（${state.results.length - ok.length}人は失敗）` : ""}。発行したPASSはこの画面でしか表示されません。本人に直接伝えてください。</Alert>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-stone-50 text-left text-xs text-stone-600"><tr><th className="px-3 py-2">行</th><th className="px-3 py-2">氏名</th><th className="px-3 py-2">ログインID</th><th className="px-3 py-2">PASS</th></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {state.results.map((r) => (
                <tr key={r.rowNo}>
                  <td className="px-3 py-2">{r.rowNo}</td><td className="px-3 py-2">{r.name}</td><td className="px-3 py-2 font-mono">{r.loginId}</td>
                  <td className="px-3 py-2">{r.error ? <Badge tone="danger">失敗：{r.error}</Badge> : r.password ? <span className="font-mono text-base font-black">{r.password}</span> : <Badge>POSと同じPASS</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div><Button type="button" variant="outline" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); }}>{copied ? "コピーしました" : "氏名・ID・PASSをコピー（表計算に貼り付け可）"}</Button></div>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-2" onSubmit={(e) => { if (!confirm("スタッフを登録してID・PASSを発行しますか？")) e.preventDefault(); }}>
      <input type="hidden" name="batch_id" value={batchId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <div><SubmitButton disabled={disabled} pendingText="登録中…（人数が多いと時間がかかります）">スタッフを登録してID・PASSを発行</SubmitButton></div>
    </form>
  );
}
