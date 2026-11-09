"use client";
import { Input, Field, Textarea } from "@/components/ui/input";
import { ROLE_LABEL, EMPLOYMENT_TYPES, type AppliesTo } from "@/lib/rules";

// 規定の入力欄（規定名・本文・適用対象・施行日・初期案）。新規と改定案で共通
export function RuleFields({ title, body, applies, effective, provisional }: { title: string; body: string; applies: AppliesTo; effective: string | null; provisional: boolean }) {
  return (
    <>
      <Field label="規定名"><Input name="title" defaultValue={title} required minLength={2} maxLength={100} /></Field>
      <Field label="本文" hint="「## 見出し」「- 箇条書き」「1. 番号付き」が使えます。空行で段落を分けます">
        <Textarea name="body" defaultValue={body} className="min-h-96 font-mono text-sm" />
      </Field>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-bold text-stone-700">適用対象（何も選ばなければ全員）</legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(ROLE_LABEL).map(([code, label]) => (
            <label key={code} className="flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 px-3 text-sm has-[:checked]:border-brand-700 has-[:checked]:bg-brand-50">
              <input type="checkbox" name="roles" value={code} defaultChecked={applies.roles?.includes(code)} className="size-4" />{label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {EMPLOYMENT_TYPES.map((t) => (
            <label key={t} className="flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 px-3 text-sm has-[:checked]:border-brand-700 has-[:checked]:bg-brand-50">
              <input type="checkbox" name="employment_types" value={t} defaultChecked={applies.employment_types?.includes(t)} className="size-4" />{t}
            </label>
          ))}
        </div>
        <p className="text-xs text-stone-500">役職と雇用区分の両方を選んだときは、両方に当てはまる人が対象です。</p>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="施行日"><Input type="date" name="effective_date" defaultValue={effective ?? ""} /></Field>
        <label className="flex min-h-11 items-center gap-2 self-end text-sm font-bold"><input type="checkbox" name="is_provisional" defaultChecked={provisional} className="size-5" />初期案（労務確認前。施行済みとして扱わない）</label>
      </div>
    </>
  );
}
