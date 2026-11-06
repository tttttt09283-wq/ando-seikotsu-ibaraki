import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/server/session";
import { commitBalance, rollbackBalance } from "../actions";
import { summarizeBalance, type BalanceRowData } from "@/lib/leave/import-balance";
import type { StaffRowData } from "@/lib/import-staff";
import { LEAVE_SHORT_LABEL, fmtDays } from "@/lib/leave/types";
import { ROLE_LABEL } from "@/lib/roles";
import { formatJstDateTime } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/submit-button";
import { Flash } from "@/components/flash";
import { StaffCommit } from "./staff-commit";

export const metadata: Metadata = { title: "取り込み内容の確認" };

type Row = { row_no: number; data: Record<string, unknown>; errors: string[]; warnings: string[]; result: string | null };

export default async function ImportBatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; only?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data: b } = await supabase.from("import_batches").select("*").eq("id", id).maybeSingle();
  if (!b) notFound();
  if (!(await can(b.kind === "staff" ? "master.manage" : "leave.import"))) notFound();
  const { data } = await supabase.from("import_rows").select("row_no, data, errors, warnings, result").eq("batch_id", id).order("row_no");
  const rows = (data ?? []) as Row[];
  const errorRows = rows.filter((r) => r.errors.length);
  const warnRows = rows.filter((r) => r.warnings.length && !r.errors.length);
  const shown = sp.only === "problems" ? rows.filter((r) => r.errors.length || r.warnings.length) : rows;
  const isBalance = b.kind === "leave_balance";
  const summary = isBalance ? summarizeBalance(rows.map((r) => ({ rowNo: r.row_no, data: r.data as Partial<BalanceRowData>, errors: r.errors, warnings: r.warnings }))) : [];
  return (
    <>
      <div>
        <Link href="/admin/import" className="text-sm text-brand-700">‹ CSV取り込み</Link>
        <h1 className="text-xl font-black text-brand-800">{isBalance ? "残数" : "スタッフ"}の取り込み：{b.file_name}</h1>
        <p className="text-sm text-stone-600">アップロード {formatJstDateTime(b.created_at)}{b.executed_at ? ` ／ 取り込み ${formatJstDateTime(b.executed_at)}` : ""}</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent><p className="text-sm text-stone-600">行数</p><p className="text-2xl font-black">{rows.length}</p></CardContent></Card>
        <Card><CardContent><p className="text-sm text-stone-600">エラー（直さないと取り込めない）</p><p className={`text-2xl font-black ${errorRows.length ? "text-red-700" : "text-green-700"}`}>{errorRows.length}</p></CardContent></Card>
        <Card><CardContent><p className="text-sm text-stone-600">注意（確認のうえ取り込める）</p><p className={`text-2xl font-black ${warnRows.length ? "text-amber-700" : ""}`}>{warnRows.length}</p></CardContent></Card>
      </div>
      {isBalance && summary.length ? (
        <Card><CardContent className="flex flex-wrap gap-4 text-sm">{summary.map((s) => <span key={s.label}><b>{s.label}</b>：{s.people}人・{s.rows}行・合計 {fmtDays(s.days)}</span>)}</CardContent></Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{b.status === "validated" ? "取り込みの実行" : "状態"}</CardTitle>
          <Badge tone={b.status === "imported" ? "ok" : b.status === "rolled_back" ? "neutral" : "warn"}>{b.status === "validated" ? "確認待ち" : b.status === "imported" ? "取り込み済み" : b.status === "rolled_back" ? `取り消し済み（${b.note ?? ""}）` : b.status}</Badge>
        </CardHeader>
        <CardContent className="grid gap-3">
          {b.status === "validated" && errorRows.length ? <Alert tone="danger">エラーのある行が{errorRows.length}行あります。CSVを直して、もう一度アップロードしてください。</Alert> : null}
          {b.status === "validated" && isBalance ? (
            <form action={commitBalance}><input type="hidden" name="batch_id" value={id} /><SubmitButton disabled={errorRows.length > 0} pendingText="取り込み中…">この内容で残数を取り込む</SubmitButton></form>
          ) : null}
          {b.status === "validated" && !isBalance ? <StaffCommit batchId={id} disabled={errorRows.length > 0} /> : null}
          {b.status === "imported" && isBalance ? (
            <form action={rollbackBalance} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <input type="hidden" name="batch_id" value={id} />
              <Field label="取り込みを取り消す（取り込み後に取得・修正があった場合は取り消せません）"><Input name="reason" required minLength={2} placeholder="取り消す理由" /></Field>
              <SubmitButton variant="danger">取り消す</SubmitButton>
            </form>
          ) : null}
          {b.status === "imported" && !isBalance ? <p className="text-sm text-stone-600">登録したスタッフの修正・退職は「スタッフ管理」から行います。{b.note ? `（${b.note}）` : ""}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>行ごとの検証結果</CardTitle>
          <Link href={sp.only === "problems" ? `/admin/import/${id}` : `/admin/import/${id}?only=problems`} className="text-sm font-bold text-brand-700">{sp.only === "problems" ? "すべて表示" : "エラー・注意だけ表示"}</Link>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-stone-50 text-left text-xs text-stone-600">
              {isBalance
                ? <tr><th className="px-3 py-2">行</th><th className="px-3 py-2">スタッフ</th><th className="px-3 py-2">区分</th><th className="px-3 py-2">付与日</th><th className="px-3 py-2">有効期限</th><th className="px-3 py-2 text-right">残日数</th><th className="px-3 py-2">結果</th></tr>
                : <tr><th className="px-3 py-2">行</th><th className="px-3 py-2">スタッフ</th><th className="px-3 py-2">ログインID</th><th className="px-3 py-2">所属・役職</th><th className="px-3 py-2">入社日</th><th className="px-3 py-2">結果</th></tr>}
            </thead>
            <tbody className="divide-y divide-stone-100">
              {shown.map((r) => {
                const status = r.errors.length ? <ul className="text-red-700">{r.errors.map((e) => <li key={e}>✕ {e}</li>)}</ul>
                  : <>{r.warnings.length ? <ul className="text-amber-800">{r.warnings.map((w) => <li key={w}>! {w}</li>)}</ul> : <span className="text-green-700">OK</span>}{r.result ? <p className="text-xs text-stone-500">{r.result}</p> : null}</>;
                if (isBalance) {
                  const d = r.data as Partial<BalanceRowData>;
                  return <tr key={r.row_no} className={r.errors.length ? "bg-red-50" : ""}><td className="px-3 py-2">{r.row_no}</td><td className="px-3 py-2">{d.name}<br /><span className="font-mono text-xs text-stone-500">{d.staff_code}</span></td><td className="px-3 py-2">{d.type_code ? LEAVE_SHORT_LABEL[d.type_code] : "-"}</td><td className="px-3 py-2">{d.grant_date ?? "-"}</td><td className="px-3 py-2">{d.expires_on ?? "-"}</td><td className="px-3 py-2 text-right tabular-nums">{fmtDays(d.remaining)}</td><td className="px-3 py-2">{status}</td></tr>;
                }
                const d = r.data as Partial<StaffRowData>;
                return <tr key={r.row_no} className={r.errors.length ? "bg-red-50" : ""}><td className="px-3 py-2">{r.row_no}</td><td className="px-3 py-2">{d.name}<br /><span className="font-mono text-xs text-stone-500">{d.staff_code}</span></td><td className="px-3 py-2 font-mono">{d.login_id}</td>
                  <td className="px-3 py-2">{d.global_role ? ROLE_LABEL[d.global_role] : (d.assignments ?? []).map((a) => `${a.store_name} ${ROLE_LABEL[a.role]}`).join("／") || "-"}</td><td className="px-3 py-2">{d.hire_date ?? "-"}</td><td className="px-3 py-2">{status}</td></tr>;
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
