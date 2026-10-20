"use client";

import { useRef, useState, useTransition } from "react";
import { Badge, Table, Td } from "@/components/ui";
import { PAY_TYPE_LABELS } from "@/lib/payroll/table";
import { commitWageImport, previewWageImport, type WagePreview } from "./actions";

const ACTIONS = {
  create: ["新規登録", "blue"],
  change: ["変更", "yellow"],
  unchanged: ["変更なし", "gray"],
  unknown_staff: ["取り込まない", "red"],
} as const;

const yen = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("ja-JP")}円`);

/** 賃金管理表の取込：読み込んで確認 → 取り込む */
export function WageImportForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<WagePreview | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    setResult(null);
    startTransition(async () => setPreview(await previewWageImport(fd)));
  };
  const ok = preview?.ok ? preview : null;
  const targets = ok ? ok.rows.filter((r) => (r.action === "create" || r.action === "change") && r.staffId) : [];

  const commit = () =>
    startTransition(async () => {
      if (!ok) return;
      const r = await commitWageImport({
        month: ok.month,
        fileName: ok.fileName,
        rows: targets.map((t) => ({
          staffId: t.staffId as string,
          pay_type: t.pay_type,
          basic_wage: t.basic_wage,
          hourly_wage: t.hourly_wage,
          daily_wage: t.daily_wage,
          monthly_hours: t.monthly_hours,
          overtime_threshold_hours: t.overtime_threshold_hours,
          fixed_overtime_allowance: t.fixed_overtime_allowance,
          commute_type: t.commute_type,
          commute_amount: t.commute_amount,
          qualification_allowance: t.qualification_allowance,
          misc_allowance: t.misc_allowance,
        })),
      });
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
          run();
        }}
      >
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">ファイル</span>
          <input name="file" type="file" accept=".xlsx,.xlsm" required aria-label="賃金管理表" className="text-sm" onChange={() => setPreview(null)} />
        </label>
        {ok && ok.sheets.length > 1 && (
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">シート</span>
            <select name="sheet" defaultValue={ok.sheet} key={ok.sheet} onChange={run} className="rounded-md border border-slate-300 px-2 py-1.5">
              {ok.sheets.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
        {ok && (
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">適用開始月</span>
            <input type="month" name="month" defaultValue={ok.month} key={ok.month} onBlur={run} className="rounded-md border border-slate-300 px-2 py-1.5" />
          </label>
        )}
        <button type="submit" disabled={pending} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "処理中…" : ok ? "読み込み直す" : "読み込んで確認"}
        </button>
      </form>
      {preview && !preview.ok && <p className="text-sm text-rose-700">{preview.message}</p>}
      {ok && (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="font-medium">
              {ok.fileName} ／ シート「{ok.sheet}」 → {ok.month} から適用
            </span>
            <Badge tone="blue">新規 {ok.rows.filter((r) => r.action === "create").length}</Badge>
            <Badge tone="yellow">変更 {ok.rows.filter((r) => r.action === "change").length}</Badge>
            <Badge>変更なし {ok.rows.filter((r) => r.action === "unchanged").length}</Badge>
            <Badge tone="red">取り込まない {ok.rows.filter((r) => r.action === "unknown_staff").length + ok.issues.length}</Badge>
          </div>
          {ok.issues.length > 0 && (
            <ul className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              {ok.issues.map((i) => (
                <li key={i.row}>
                  {i.row}行目：{i.message}
                </li>
              ))}
            </ul>
          )}
          <Table head={["行", "氏名（表）", "スタッフ", "形態", "基礎賃金・時給・日給", "月の所定", "残業の基準", "固定残業代", "交通費", "雑手当", "処理", "確認事項"]}>
            {ok.rows.map((r) => (
              <tr key={r.row} className={r.action === "unchanged" ? "text-slate-400" : ""}>
                <Td>{r.row}</Td>
                <Td>{r.name}</Td>
                <Td>{r.staffCode ? `${r.staffCode} ${r.systemName}` : "—"}</Td>
                <Td>{PAY_TYPE_LABELS[r.pay_type]}</Td>
                <Td>{yen(r.basic_wage ?? r.hourly_wage ?? r.daily_wage)}</Td>
                <Td>{r.monthly_hours === null ? "—" : `${r.monthly_hours}時間`}</Td>
                <Td>{r.overtime_threshold_hours === null ? "—" : `${r.overtime_threshold_hours}時間`}</Td>
                <Td>{yen(r.fixed_overtime_allowance)}</Td>
                <Td>{r.commute_type === "none" ? "—" : `${r.commute_type === "monthly" ? "月" : "日"} ${yen(r.commute_amount)}`}</Td>
                <Td>{r.misc_allowance ? yen(r.misc_allowance) : "—"}</Td>
                <Td>
                  <Badge tone={ACTIONS[r.action][1]}>{ACTIONS[r.action][0]}</Badge>
                </Td>
                <Td className="whitespace-normal text-xs text-amber-700">{r.note ?? ""}</Td>
              </tr>
            ))}
          </Table>
          <button
            type="button"
            onClick={commit}
            disabled={pending || targets.length === 0}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "登録中…" : `この内容で登録する（${targets.length}人）`}
          </button>
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
