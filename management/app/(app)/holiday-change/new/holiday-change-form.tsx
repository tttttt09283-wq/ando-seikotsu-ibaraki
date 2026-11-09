"use client";
import { useActionState, useState } from "react";
import { submitHolidayChange, type HcState } from "../actions";
import { Input, Select, Field } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/submit-button";
import { ActionForm } from "@/components/action-form";
import { useFields } from "@/components/use-fields";
import { workMinutes, fmtMinutes } from "@/lib/part-time";
import { formatDate } from "@/lib/time";

type Store = { id: string; name: string };
type Candidate = { usage_id: string; user_name: string; usage_date: string; store_id: string };

export function HolidayChangeForm({ stores, candidates, idempotencyKey }: { stores: Store[]; candidates: Candidate[]; idempotencyKey: string }) {
  const [state, action, pending] = useActionState<HcState, FormData>(submitHolidayChange, {});
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("15:00");
  const [brk, setBrk] = useState(0);
  const [usage, setUsage] = useState("");
  const { bind } = useFields();
  const list = candidates.filter((c) => c.store_id === storeId);
  const minutes = workMinutes(start, end, brk);
  return (
    <ActionForm action={action} pending={pending} className="grid gap-4">
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {stores.length > 1 ? (
        <Field label="院"><Select name="store_id" value={storeId} onChange={(e) => setStoreId(e.target.value)}>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
      ) : <input type="hidden" name="store_id" value={storeId} />}
      <Field label="変更する振休（承認済みで、まだ先の日のもの）">
        <Select name="usage_id" required value={list.some((c) => c.usage_id === usage) ? usage : ""} onChange={(e) => setUsage(e.target.value)}>
          <option value="" disabled>選択してください</option>
          {list.map((c) => <option key={c.usage_id} value={c.usage_id}>{formatDate(c.usage_date)}　{c.user_name}さん</option>)}
        </Select>
      </Field>
      {list.length === 0 ? <p className="text-xs text-stone-500">変更できる振休がありません（振休の申請が承認されている必要があります）。</p> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="開始"><Input type="time" name="start_time" required value={start} onChange={(e) => setStart(e.target.value)} step={300} /></Field>
        <Field label="終了"><Input type="time" name="end_time" required value={end} onChange={(e) => setEnd(e.target.value)} step={300} /></Field>
        <Field label="休憩（分）"><Input type="number" name="break_minutes" min={0} max={240} step={5} value={brk} onChange={(e) => setBrk(Number(e.target.value) || 0)} /></Field>
      </div>
      <p className="text-sm">実働：<b>{fmtMinutes(minutes)}</b></p>
      <Field label="申請理由（必須）"><Input {...bind("reason")} required minLength={2} maxLength={500} placeholder="例：急な欠員が出たため、振休の日に勤務してもらう" /></Field>
      <Alert tone="warn">承認されると、この振休は「使ったこと」になり、残数には戻りません。勤務はアルバイトとしての扱いになります。</Alert>
      <div><SubmitButton pendingText="申請中…" disabled={minutes <= 0 || list.length === 0}>GMに確認を依頼する</SubmitButton></div>
    </ActionForm>
  );
}
