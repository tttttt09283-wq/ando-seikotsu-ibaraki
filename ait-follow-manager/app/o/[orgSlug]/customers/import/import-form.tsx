"use client";

import { useActionState } from "react";
import { importCsv, type ImportState } from "./actions";
import { SubmitButton } from "@/components/forms";
import { Field, Input, Select } from "@/components/ui/input";

export function ImportForm({ orgSlug, stores }: { orgSlug: string; stores: { id: string; name: string; code: string }[] }) {
  const [state, action] = useActionState<ImportState, FormData>(importCsv, {});
  return (
    <div className="grid gap-4">
      <form action={action} className="grid gap-3 rounded-lg border bg-card p-4">
        <input type="hidden" name="orgSlug" value={orgSlug} />
        <Field label="取込の種類" htmlFor="kind">
          <Select id="kind" name="kind" defaultValue="customers">
            <option value="customers">顧客</option>
            <option value="visits">来店履歴</option>
            <option value="appointments">予約</option>
          </Select>
        </Field>
        <Field label="取込先の店舗（店舗コード列が空の行に適用）" htmlFor="storeId">
          <Select id="storeId" name="storeId">
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}（{s.code}）
              </option>
            ))}
          </Select>
        </Field>
        <Field label="CSV ファイル（UTF-8 または Shift_JIS、5MB・5,000行まで）" htmlFor="file">
          <Input id="file" name="file" type="file" accept=".csv,text/csv" required className="py-2" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="skipErrors" className="size-5" />
          エラー行を除いて取り込む
        </label>
        <SubmitButton pendingText="検証・取込中…">検証して取り込む</SubmitButton>
      </form>

      {(state.error || state.message) && (
        <div role={state.error ? "alert" : "status"} className={`rounded-md px-3 py-2 text-sm font-medium ${state.error ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}>
          {state.error ?? state.message}
        </div>
      )}
      {state.summary && (
        <dl className="grid grid-cols-3 gap-2 text-center text-sm sm:grid-cols-6">
          {[
            ["総行数", state.summary.total],
            ["正常", state.summary.valid],
            ["エラー行", state.summary.invalid],
            ["新規", state.summary.inserted],
            ["更新", state.summary.updated],
            ["スキップ", state.summary.skipped],
          ].map(([k, v]) => (
            <div key={k} className="rounded-md border bg-card p-2">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="text-lg font-bold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {state.errors && state.errors.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <caption className="p-2 text-left font-semibold">エラー一覧（{state.errors.length}件）</caption>
            <thead className="bg-muted text-left text-xs">
              <tr>
                <th className="p-2">行</th>
                <th className="p-2">列</th>
                <th className="p-2">内容</th>
              </tr>
            </thead>
            <tbody>
              {state.errors.slice(0, 200).map((e, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2 tabular-nums">{e.row}</td>
                  <td className="p-2">{e.column}</td>
                  <td className="p-2">{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
