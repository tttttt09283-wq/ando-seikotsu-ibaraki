"use client";

import { useState, useTransition } from "react";
import { Badge, Table, Td } from "@/components/ui";
import { commitLeaveImport, previewLeaveImport, type PreviewResult } from "./actions";

const ACTIONS = {
  create: ["新規登録", "blue"],
  adjust: ["差分を調整", "yellow"],
  unchanged: ["変更なし", "gray"],
  unknown_staff: ["スタッフ未登録", "red"],
} as const;

/** 取込の2段階操作：ファイルを読んで確認 → 取り込む */
export function ImportForm() {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const errors = preview?.ok ? preview.issues.filter((i) => i.level === "error") : [];
  const unknown = preview?.ok ? preview.rows.filter((r) => r.action === "unknown_staff") : [];
  const changes = preview?.ok ? preview.rows.filter((r) => r.action === "create" || r.action === "adjust") : [];
  const canCommit = preview?.ok && errors.length === 0 && unknown.length === 0 && changes.length > 0;

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          setResult(null);
          startTransition(async () => setPreview(await previewLeaveImport(formData)));
        }}
      >
        <input name="file" type="file" accept=".xlsx,.xlsm,.csv" required aria-label="取込ファイル" className="text-sm" />
        <button type="submit" disabled={pending} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending && !preview ? "読み込み中…" : "読み込んで確認"}
        </button>
      </form>

      {preview && !preview.ok && <p className="text-sm text-rose-700">{preview.message}</p>}

      {preview?.ok && (
        <>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="font-medium">{preview.fileName}</span>
            <Badge tone="blue">新規 {preview.rows.filter((r) => r.action === "create").length}</Badge>
            <Badge tone="yellow">調整 {preview.rows.filter((r) => r.action === "adjust").length}</Badge>
            <Badge>変更なし {preview.rows.filter((r) => r.action === "unchanged").length}</Badge>
            {(errors.length > 0 || unknown.length > 0) && <Badge tone="red">要修正 {errors.length + unknown.length}</Badge>}
          </div>

          {preview.issues.length > 0 && (
            <ul className="space-y-1 rounded-md bg-slate-50 p-3 text-sm">
              {preview.issues.map((i, n) => (
                <li key={n} className={i.level === "error" ? "text-rose-700" : "text-amber-700"}>
                  {i.row > 0 && `${i.row}行目：`}
                  {i.message}
                </li>
              ))}
            </ul>
          )}

          <Table head={["行", "スタッフID", "ファイルの氏名", "システムの氏名", "付与日", "付与", "取得済み", "残（取込後）", "現在の残", "処理"]}>
            {preview.rows.map((r) => (
              <tr key={r.row} className={r.action === "unchanged" ? "text-slate-400" : ""}>
                <Td>{r.row}</Td>
                <Td className="font-mono">{r.staff_code}</Td>
                <Td>{r.name ?? ""}</Td>
                <Td className={r.name && r.systemName && r.name.replace(/\s/g, "") !== r.systemName.replace(/\s/g, "") ? "text-amber-700" : ""}>
                  {r.systemName ?? "—"}
                </Td>
                <Td>{r.grant_date}</Td>
                <Td>{r.granted_days}日</Td>
                <Td>{r.taken_days}日</Td>
                <Td className="font-bold">{r.granted_days - r.taken_days}日</Td>
                <Td>{r.currentRemaining === null ? "—" : `${r.currentRemaining}日`}</Td>
                <Td>
                  <Badge tone={ACTIONS[r.action][1]}>{ACTIONS[r.action][0]}</Badge>
                </Td>
              </tr>
            ))}
          </Table>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!canCommit || pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await commitLeaveImport(changes, preview.fileName);
                  setResult(r);
                  if (r.ok) setPreview(null);
                })
              }
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "取り込み中…" : `この内容で取り込む（${changes.length}件）`}
            </button>
            {!canCommit && changes.length > 0 && <span className="text-sm text-rose-700">エラー・未登録のスタッフを修正してから取り込んでください</span>}
            {changes.length === 0 && errors.length === 0 && unknown.length === 0 && <span className="text-sm text-slate-600">取り込む変更はありません（すべて最新です）</span>}
          </div>
        </>
      )}
      {result && <p role="status" className={`text-sm ${result.ok ? "text-emerald-700" : "text-rose-700"}`}>{result.message}</p>}
    </div>
  );
}
