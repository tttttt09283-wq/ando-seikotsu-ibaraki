"use client";
import { useActionState, useState } from "react";
import { saveMinutes, type MinutesState } from "../actions";
import { Input, Select, Field, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { cleanDecisions, type DecisionInput } from "@/lib/meetings";

type Member = { user_id: string; name: string };
type Initial = { agenda: string; content: string; attendees: string[]; guests: string; decisions: DecisionInput[]; noDecisions: boolean };

export function MinutesForm({ meetingId, members, initial, submitted, canSubmit, heldOn }: {
  meetingId: number; members: Member[]; initial: Initial; submitted: boolean; canSubmit: boolean; heldOn: string;
}) {
  const [state, action] = useActionState<MinutesState, FormData>(saveMinutes, {});
  const [rows, setRows] = useState<DecisionInput[]>(initial.decisions.length ? initial.decisions : [{ id: null, title: "", detail: "", owner_user_id: "", due_date: "" }]);
  const [noDecisions, setNoDecisions] = useState(initial.noDecisions);
  const set = (i: number, patch: Partial<DecisionInput>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const decisions = noDecisions ? [] : cleanDecisions(rows);
  // 参加者の候補：院の所属者＋すでに参加者になっている人（他院の人など）
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={meetingId} />
      <input type="hidden" name="decisions" value={JSON.stringify(decisions)} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="ok">{state.ok}</Alert> : null}
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-bold text-stone-700">参加者（必須）</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {members.map((m) => (
            <label key={m.user_id} className="flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 px-3 has-[:checked]:border-brand-700 has-[:checked]:bg-brand-50">
              <input type="checkbox" name="attendees" value={m.user_id} defaultChecked={initial.attendees.includes(m.user_id)} className="size-5" /><span className="text-sm">{m.name}</span>
            </label>
          ))}
        </div>
        <Field label="ほかの参加者（他院・社外の人。1行に1人）"><Textarea name="guests" defaultValue={initial.guests} className="min-h-16" placeholder="例：〇〇メーカー 担当者" /></Field>
      </fieldset>
      <Field label="議題（必須）"><Textarea name="agenda" defaultValue={initial.agenda} required={false} placeholder={"例：\n1. 今月の新規・再来の数値\n2. 口コミを増やす取り組み"} /></Field>
      <Field label="会議の内容（必須）"><Textarea name="content" defaultValue={initial.content} className="min-h-40" placeholder="話し合ったこと・出た意見・決まった理由など" /></Field>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-bold text-stone-700">決定事項（必須：担当者・実施期限・具体的な行動）</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="no_decisions" checked={noDecisions} onChange={(e) => setNoDecisions(e.target.checked)} className="size-5" />この会議では決定事項なし</label>
        {!noDecisions ? (
          <>
            {rows.map((r, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-stone-200 bg-stone-50 p-3 sm:grid-cols-2">
                <Field label={`決定事項 ${i + 1}`}><Input value={r.title} onChange={(e) => set(i, { title: e.target.value })} maxLength={200} placeholder="例：口コミのPOPを作る" /></Field>
                <Field label="具体的な行動"><Input value={r.detail} onChange={(e) => set(i, { detail: e.target.value })} maxLength={1000} placeholder="例：受付に置くPOPを3種類作って掲示" /></Field>
                <Field label="担当者">
                  <Select value={r.owner_user_id} onChange={(e) => set(i, { owner_user_id: e.target.value })}>
                    <option value="">選択</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                  </Select>
                </Field>
                <div className="flex items-end gap-2">
                  <div className="grow"><Field label="実施期限"><Input type="date" value={r.due_date} min={heldOn} onChange={(e) => set(i, { due_date: e.target.value })} /></Field></div>
                  <Button type="button" variant="ghost" className="text-red-700" onClick={() => setRows((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : [{ id: null, title: "", detail: "", owner_user_id: "", due_date: "" }]))}>外す</Button>
                </div>
              </div>
            ))}
            <div><Button type="button" variant="outline" onClick={() => setRows((x) => [...x, { id: null, title: "", detail: "", owner_user_id: "", due_date: "" }])}>＋ 決定事項を追加</Button></div>
          </>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        {!submitted ? <SubmitButton name="intent" value="draft" variant="outline" pendingText="保存中…">下書き保存</SubmitButton> : null}
        <SubmitButton name="intent" value="submit" pendingText="提出中…" disabled={!canSubmit}>{submitted ? "修正して再提出" : "議事録を正式に提出"}</SubmitButton>
        {!canSubmit ? <span className="text-xs text-stone-600">開催日（当日）から提出できます。それまでは下書き保存できます。</span> : null}
      </div>
    </form>
  );
}
