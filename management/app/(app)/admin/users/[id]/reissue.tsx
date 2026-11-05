"use client";
import { useActionState } from "react";
import { reissuePassword, type IssueState } from "../actions";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/submit-button";
import { IssuedCredentials } from "@/components/issued-credentials";

export function ReissuePassword({ userId, disabled }: { userId: string; disabled: boolean }) {
  const [state, action] = useActionState<IssueState, FormData>(reissuePassword, {});
  if (state.issued) return <IssuedCredentials {...state.issued} />;
  return (
    <form action={action} className="grid gap-2" onSubmit={(e) => { if (!confirm("PASSを再発行しますか？今のPASS（POSのPASSも）は使えなくなります")) e.preventDefault(); }}>
      <input type="hidden" name="user_id" value={userId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <p className="text-sm text-stone-600">PASSを忘れた場合に使います。新しいPASSはこの画面に1回だけ表示されます。</p>
      <div><SubmitButton variant="outline" disabled={disabled} pendingText="発行中…">PASSを再発行</SubmitButton></div>
    </form>
  );
}
