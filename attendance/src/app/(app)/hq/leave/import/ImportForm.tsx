"use client";

import { useRef, useState, useTransition } from "react";
import { Badge, Table, Td } from "@/components/ui";
import { commitLeaveImport, commitSnapshotImport, previewLeaveImport, type PreviewResult } from "./actions";

const ACTIONS = {
  create: ["新規登録", "blue"],
  adjust: ["差分を調整", "yellow"],
  unchanged: ["変更なし", "gray"],
  unknown_staff: ["取り込まない", "red"],
} as const;

/**
 * 取込の2段階操作：ファイルを読んで確認 → 取り込む。
 * 照合できないスタッフの行は取り込まずに残りを取り込む（スタッフ登録後に同じ表で取り込み直せる）。
 */
export function ImportForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const runPreview = () => {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    setResult(null);
    startTransition(async () => setPreview(await previewLeaveImport(formData)));
  };

  const ok = preview?.ok ? preview : null;
  const errors = ok ? ok.issues.filter((i) => i.level === "error") : [];
  const changes = ok ? ok.rows.filter((r) => r.action === "create" || r.action === "adjust") : [];
  const skipped = ok ? ok.rows.filter((r) => r.action === "unknown_staff") : [];
  const canCommit = Boolean(ok) && errors.length === 0 && changes.length > 0;

  const commit = () =>
    startTransition(async () => {
      if (!ok) return;
      const r =
        ok.format === "grants"
          ? await commitLeaveImport(ok.rows.filter((x) => x.action === "create" || x.action === "adjust"), ok.fileName)
          : await commitSnapshotImport(
              ok.rows
                .filter((x) => (x.action === "create" || x.action === "adjust") && x.staffId)
                .map((x) => ({ row: x.row, staffId: x.staffId as string, remaining_days: x.remaining_days, plan: x.plan })),
              ok.asOf,
              ok.fileName,
            );
      setResult(r);
      if (r.ok) setPreview(null);
    });

  return (
    <div className="space-y-4">
      <form
        ref={formRef}
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          runPreview();
        }}
      >
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">ファイル</span>
          <input name="file" type="file" accept=".xlsx,.xlsm,.csv" required aria-label="取込ファイル" className="text-sm" onChange={() => setPreview(null)} />
        </label>
        {ok && ok.sheets.length > 1 && (
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">シート</span>
            <select name="sheet" defaultValue={ok.sheet} key={ok.sheet} className="rounded-md border border-slate-300 px-2 py-1.5" onChange={runPreview}>
              {ok.sheets.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
        {ok?.format === "snapshot" && (
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">残数の基準日</span>
            <input name="as_of" type="date" defaultValue={ok.asOf} key={ok.asOf} className="rounded-md border border-slate-300 px-2 py-1.5" onBlur={runPreview} />
          </label>
        )}
        <button type="submit" disabled={pending} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "処理中…" : ok ? "読み込み直す" : "読み込んで確認"}
        </button>
      </form>

      {preview && !preview.ok && <p className="text-sm text-rose-700">{preview.message}</p>}

      {ok && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">
              {ok.fileName}
              {ok.sheets.length > 1 && ` ／ シート「${ok.sheet}」`}
            </span>
            <Badge tone="blue">{ok.format === "grants" ? "付与ごとの形式" : `月末残数の形式（${ok.asOf}時点）`}</Badge>
            <Badge tone="blue">新規 {ok.rows.filter((r) => r.action === "create").length}</Badge>
            <Badge tone="yellow">調整 {ok.rows.filter((r) => r.action === "adjust").length}</Badge>
            <Badge>変更なし {ok.rows.filter((r) => r.action === "unchanged").length}</Badge>
            {skipped.length > 0 && <Badge tone="red">取り込まない {skipped.length}</Badge>}
            {errors.length > 0 && <Badge tone="red">要修正 {errors.length}</Badge>}
          </div>

          {ok.issues.length > 0 && (
            <ul className="space-y-1 rounded-md bg-slate-50 p-3 text-sm">
              {ok.issues.map((i, n) => (
                <li key={n} className={i.level === "error" ? "text-rose-700" : "text-amber-700"}>
                  {i.row > 0 && `${i.row}行目：`}
                  {i.message}
                </li>
              ))}
            </ul>
          )}

          {ok.format === "grants" ? (
            <Table head={["行", "スタッフID", "ファイルの氏名", "システムの氏名", "付与日", "付与", "取得済み", "残（取込後）", "現在の残", "処理"]}>
              {ok.rows.map((r) => (
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
          ) : (
            <Table head={["行", "氏名（ファイル）", "スタッフID", "有給残（取込後）", "現在の残", "処理", "付与の振り分け（推定）・備考"]}>
              {ok.rows.map((r) => (
                <tr key={r.row} className={r.action === "unchanged" ? "text-slate-400" : ""}>
                  <Td>{r.row}</Td>
                  <Td>{r.name}</Td>
                  <Td className="font-mono">{r.staffCode ?? "—"}</Td>
                  <Td className="font-bold">{r.remaining_days}日</Td>
                  <Td>{r.currentRemaining === null ? "—" : `${r.currentRemaining}日`}</Td>
                  <Td>
                    <Badge tone={ACTIONS[r.action][1]}>{ACTIONS[r.action][0]}</Badge>
                  </Td>
                  <Td className="whitespace-normal text-xs">
                    {r.plan.map((p) => (
                      <div key={p.grant_date}>
                        {p.grant_date}付与 {p.days}日（{p.expiration_date}まで）
                      </div>
                    ))}
                    {r.note && <div className="text-amber-700">{r.note}</div>}
                  </Td>
                </tr>
              ))}
            </Table>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={!canCommit || pending} onClick={commit} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {pending ? "取り込み中…" : `この内容で取り込む（${changes.length}件）`}
            </button>
            {errors.length > 0 && <span className="text-sm text-rose-700">エラーの行を直してから、もう一度読み込んでください</span>}
            {skipped.length > 0 && errors.length === 0 && (
              <span className="text-sm text-slate-600">「取り込まない」の行はスキップします（スタッフ登録後に同じ表で取り込み直せます）</span>
            )}
            {changes.length === 0 && errors.length === 0 && <span className="text-sm text-slate-600">取り込む変更はありません（すべて最新です）</span>}
          </div>
        </>
      )}
      {result && (
        <p role="status" className={`text-sm ${result.ok ? "text-emerald-700" : "text-rose-700"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}
