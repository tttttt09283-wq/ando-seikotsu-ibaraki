"use client";
import { useActionState, useState } from "react";
import { createMeeting, type MeetingFormState } from "../actions";
import { Input, Select, Field } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/submit-button";
import { formatDate } from "@/lib/time";

function addDays(d: string, n: number) { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

export function NewMeetingForm({ stores, today }: { stores: { id: string; name: string }[]; today: string }) {
  const [state, action] = useActionState<MeetingFormState, FormData>(createMeeting, {});
  const [held, setHeld] = useState(today);
  return (
    <form action={action} className="grid gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {stores.length > 1 ? (
        <Field label="院"><Select name="store_id" defaultValue={stores[0].id}>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
      ) : <input type="hidden" name="store_id" value={stores[0].id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="開催日"><Input type="date" name="held_on" required value={held} onChange={(e) => setHeld(e.target.value)} /></Field>
        <Field label="会議名"><Input name="title" required minLength={2} maxLength={100} placeholder="例：進捗会議（週1）" list="meeting-titles" /></Field>
        <datalist id="meeting-titles"><option value="進捗会議" /><option value="問題解決会議" /><option value="院内ミーティング" /><option value="朝礼" /></datalist>
      </div>
      {held ? <p className="text-sm">議事録の提出期限：<b>{formatDate(addDays(held, 3))} 23:59</b>（開催日の3日後・日本時間）</p> : null}
      <div><SubmitButton pendingText="登録中…">会議を登録する</SubmitButton></div>
    </form>
  );
}
