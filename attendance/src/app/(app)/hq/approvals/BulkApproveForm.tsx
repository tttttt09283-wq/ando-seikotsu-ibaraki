"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Table, Td } from "@/components/ui";
import { bulkApprove, type BulkKind, type BulkResult } from "./actions";

export interface ApprovalItem {
  id: string;
  cells: ReactNode[];
}

/** 承認待ちの一覧：チェックした申請をまとめて承認する（院をまたいで選べる） */
export function BulkApproveForm({ kind, head, items, label }: { kind: BulkKind; head: string[]; items: ApprovalItem[]; label: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState("");
  const [result, setResult] = useState<BulkResult | null>(null);
  const [pending, startTransition] = useTransition();
  const failedIds = new Map((result?.failed ?? []).map((f) => [f.id, f.message]));
  const allChecked = items.length > 0 && items.every((i) => selected.has(i.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = () => {
    if (!window.confirm(`選択した${label}${selected.size}件を承認します。よろしいですか？`)) return;
    startTransition(async () => {
      const r = await bulkApprove(kind, [...selected], comment);
      setResult(r);
      // 承認できたものは一覧から消える。失敗したものは選択を残す
      setSelected(new Set(r.failed.map((f) => f.id)));
      if (r.failed.length === 0) setComment("");
    });
  };

  return (
    <div className="space-y-3">
      <Table
        head={[
          <input
            key="all"
            type="checkbox"
            aria-label={`${label}をすべて選択`}
            checked={allChecked}
            onChange={() => setSelected(allChecked ? new Set() : new Set(items.map((i) => i.id)))}
          />,
          ...head,
        ]}
      >
        {items.map((item) => (
          <tr key={item.id} className={failedIds.has(item.id) ? "bg-rose-50" : selected.has(item.id) ? "bg-brand-50" : ""}>
            <Td>
              <input type="checkbox" aria-label="選択" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
            </Td>
            {item.cells.map((c, i) => (
              <Td key={i} className="whitespace-normal">
                {c}
                {i === item.cells.length - 1 && failedIds.has(item.id) && <div className="text-xs text-rose-700">{failedIds.get(item.id)}</div>}
              </Td>
            ))}
          </tr>
        ))}
      </Table>
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={500}
          placeholder="コメント（任意・承認履歴に残ります）"
          aria-label="コメント"
          className="w-80 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending || selected.size === 0}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "承認中…" : `選択した${selected.size}件を承認`}
        </button>
      </div>
      {result && (
        <p role="status" className={`text-sm ${result.ok ? "text-emerald-700" : "text-rose-700"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}
