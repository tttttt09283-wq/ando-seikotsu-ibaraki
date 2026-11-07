"use client";
import { useActionState, useMemo, useState } from "react";
import { submitLeave, type SubmitState } from "../actions";
import { Input, Select, Field } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { fmtDays } from "@/lib/leave/types";
import { normalizeDates, shortageOf } from "@/lib/leave/requests";
import { formatDate } from "@/lib/time";

export type Person = { id: string; name: string; self: boolean; paid: { available: number; pending: number }; shift: { available: number; pending: number; nextExpiry: string | null } };

export function LeaveForm({ people, idempotencyKey, today }: { people: Person[]; idempotencyKey: string; today: string }) {
  const [state, action] = useActionState<SubmitState, FormData>(submitLeave, {});
  const [personId, setPersonId] = useState(people[0]?.id ?? "");
  const [kind, setKind] = useState<"PAID" | "SHIFT">("PAID");
  const [dates, setDates] = useState<string[]>([""]);
  const person = people.find((p) => p.id === personId) ?? people[0];
  const chosen = useMemo(() => normalizeDates(dates), [dates]);
  const b = kind === "PAID" ? person.paid : person.shift;
  const short = chosen.length > 0 && shortageOf(chosen.length, b.available, b.pending);
  const proxy = person && !person.self;

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {people.length > 1 ? (
        <Field label="休む人" hint="院長は自院スタッフの有給を代理で申請できます（振休は本人が申請）">
          <Select name="user_id" value={personId} onChange={(e) => { setPersonId(e.target.value); if (!people.find((p) => p.id === e.target.value)?.self) setKind("PAID"); }}>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.self ? "（自分）" : ""}</option>)}
          </Select>
        </Field>
      ) : <input type="hidden" name="user_id" value={personId} />}

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-bold text-stone-700">休暇の種類</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["PAID", "SHIFT"] as const).map((k) => (
            <label key={k} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 ${kind === k ? "border-brand-700 bg-brand-50" : "border-stone-300"} ${proxy && k === "SHIFT" ? "opacity-40" : ""}`}>
              <input type="radio" name="kind" value={k} checked={kind === k} disabled={proxy && k === "SHIFT"} onChange={() => setKind(k)} className="size-5" />
              <span className="font-bold">{k === "PAID" ? "有給" : "振休"}</span>
              <span className="ml-auto text-xs text-stone-600">残 {fmtDays((k === "PAID" ? person.paid : person.shift).available)}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-stone-500">
          {kind === "PAID" ? "承認者：社長" : "承認者：所属院の院長（院長本人の振休は本人が承認し、GM・社長に通知されます）"}
          {kind === "SHIFT" && person.shift.nextExpiry ? `　振休の期限：${formatDate(person.shift.nextExpiry)}` : ""}
        </p>
      </fieldset>

      <div className="grid gap-2">
        <span className="text-sm font-bold text-stone-700">休む日（1日ずつ追加）</span>
        {dates.map((d, i) => (
          <div key={i} className="flex gap-2">
            <Input type="date" name="dates" value={d} min={today} onChange={(e) => setDates(dates.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`休む日 ${i + 1}`} required={i === 0} />
            {dates.length > 1 ? <Button type="button" variant="ghost" onClick={() => setDates(dates.filter((_, j) => j !== i))} aria-label="この日を外す">✕</Button> : null}
          </div>
        ))}
        {dates.length < 31 ? <div><Button type="button" variant="outline" size="sm" onClick={() => setDates([...dates, ""])}>＋ 日を追加</Button></div> : null}
      </div>

      <div className="rounded-lg bg-stone-50 p-3 text-sm">
        <p>申請：<b>{chosen.length}日</b>　利用できる残数：<b>{fmtDays(b.available)}</b>{b.pending ? `（ほかに承認待ち ${fmtDays(b.pending)}）` : ""}</p>
        <p>承認後の残数：<b>{fmtDays(b.available - b.pending - chosen.length)}</b></p>
      </div>
      {short ? (
        <>
          <Alert tone="warn">残数が足りません。このまま申請すると「例外確認」として承認者に回ります（残数が足りないままでは承認できません）。</Alert>
          <Field label="例外確認の理由（必須）"><Input name="exception_note" required minLength={2} maxLength={500} /></Field>
        </>
      ) : null}
      <Field label={kind === "PAID" ? "メモ（任意。有給の理由は書かなくてかまいません）" : "メモ（任意）"}><Input name="reason" maxLength={500} /></Field>
      <div><SubmitButton pendingText="申請中…" disabled={!chosen.length}>申請する</SubmitButton></div>
    </form>
  );
}
