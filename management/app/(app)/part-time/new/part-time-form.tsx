"use client";
import { useActionState, useState } from "react";
import { submitPartTime, type PartTimeState } from "../actions";
import { Input, Select, Field } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/submit-button";
import { CATEGORY_LABEL, isAfterCutoff, shiftCutoffFor, workMinutes, fmtMinutes, type PartTimeCategory } from "@/lib/part-time";
import { formatDate } from "@/lib/time";

type Store = { id: string; name: string };
type Worker = { id: string; name: string; storeIds: string[] };

export function PartTimeForm({ stores, workers, today, cutoffDay, idempotencyKey }: { stores: Store[]; workers: Worker[]; today: string; cutoffDay: number; idempotencyKey: string }) {
  const [state, action] = useActionState<PartTimeState, FormData>(submitPartTime, {});
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [category, setCategory] = useState<PartTimeCategory>("plan");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("15:00");
  const [brk, setBrk] = useState(0);
  const late = date ? isAfterCutoff(today, date, cutoffDay) : false;
  const minutes = workMinutes(start, end, brk);
  const storeWorkers = workers.filter((w) => w.storeIds.includes(storeId));
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {stores.length > 1 ? (
        <Field label="院"><Select name="store_id" value={storeId} onChange={(e) => setStoreId(e.target.value)}>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
      ) : <input type="hidden" name="store_id" value={storeId} />}
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-bold text-stone-700">申請区分</legend>
        {(["plan", "help", "busy"] as const).map((c) => (
          <label key={c} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 ${category === c ? "border-brand-700 bg-brand-50" : "border-stone-300"}`}>
            <input type="radio" name="category" value={c} checked={category === c} onChange={() => setCategory(c)} className="size-5" /><span className="font-bold">{CATEGORY_LABEL[c]}</span>
          </label>
        ))}
        {category === "help" ? <p className="text-xs text-stone-600">緊急でも社長の承認が必要です。承認されるまで勤務予定にはなりません。</p> : null}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="勤務日"><Input type="date" name="work_date" required min={today} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="開始"><Input type="time" name="start_time" required value={start} onChange={(e) => setStart(e.target.value)} step={300} /></Field>
        <Field label="終了"><Input type="time" name="end_time" required value={end} onChange={(e) => setEnd(e.target.value)} step={300} /></Field>
        <Field label="休憩（分）"><Input type="number" name="break_minutes" min={0} max={240} step={5} value={brk} onChange={(e) => setBrk(Number(e.target.value) || 0)} /></Field>
      </div>
      <p className="text-sm">実働：<b>{fmtMinutes(minutes)}</b>{date ? <>　シフト確定の基準日：{formatDate(shiftCutoffFor(date, cutoffDay))}</> : null}</p>
      {late ? (
        <>
          <Alert tone="warn">シフト確定（前月{cutoffDay}日）を過ぎた申請のため「例外申請」になります。理由を入力してください。</Alert>
          <Field label="例外申請の理由（必須）"><Input name="exception_reason" required minLength={2} maxLength={500} /></Field>
        </>
      ) : null}
      <Field label="勤務する人（アルバイト）" hint="アルバイトの人の登録が済んでいない場合は「未定」で申請し、あとから設定できます">
        <Select name="worker_user_id" defaultValue="">
          <option value="">未定（あとで入力）</option>
          {storeWorkers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
      </Field>
      <Field label="申請理由（必須）"><Input name="reason" required minLength={2} maxLength={500} placeholder="例：スタッフ研修のため午前が人手不足" /></Field>
      <div><SubmitButton pendingText="申請中…" disabled={minutes <= 0}>社長に申請する</SubmitButton></div>
    </form>
  );
}
