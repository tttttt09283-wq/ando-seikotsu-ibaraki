import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/server/session";
import { uploadCsv } from "./actions";
import { BALANCE_HEADERS } from "@/lib/leave/import-balance";
import { STAFF_HEADERS } from "@/lib/import-staff";
import { formatJstDateTime } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/submit-button";
import { Flash } from "@/components/flash";

export const metadata: Metadata = { title: "CSV取り込み" };
const STATUS: Record<string, { text: string; tone: "neutral" | "ok" | "warn" | "danger" }> = {
  validated: { text: "確認待ち", tone: "warn" }, imported: { text: "取り込み済み", tone: "ok" }, rolled_back: { text: "取り消し済み", tone: "neutral" }, failed: { text: "失敗", tone: "danger" },
};

function UploadCard({ kind, title, headers, hint }: { kind: "staff" | "leave_balance"; title: string; headers: { required: string[]; optional: string[] }; hint: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><a href={`/admin/import/template?kind=${kind}`} className="text-sm font-bold text-brand-700">ひな形をダウンロード</a></CardHeader>
      <CardContent>
        <form action={uploadCsv} className="grid gap-3">
          <input type="hidden" name="kind" value={kind} />
          <p className="text-sm text-stone-600">{hint}</p>
          <p className="text-xs text-stone-500">必須の列：{headers.required.join("・")}／任意：{headers.optional.join("・")}</p>
          <Field label="CSVファイル（Excelの「CSV（コンマ区切り）」でも可）"><Input name="file" type="file" accept=".csv,text/csv" required className="py-2" /></Field>
          <div><SubmitButton pendingText="検証中…">アップロードして検証</SubmitButton></div>
        </form>
      </CardContent>
    </Card>
  );
}

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [canStaff, canLeave] = await Promise.all([can("master.manage"), can("leave.import")]);
  if (!canStaff && !canLeave) notFound();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: batches } = await supabase.from("import_batches").select("id, kind, file_name, status, row_count, error_count, created_at").order("created_at", { ascending: false }).limit(30);
  return (
    <>
      <h1 className="text-xl font-black text-brand-800">CSV取り込み（初期データ移行）</h1>
      <Flash ok={sp.ok} err={sp.err} />
      <Alert tone="warn">アップロードしただけでは取り込まれません。次の画面で全行の検証結果を確認してから取り込みます。<b>本番への実データの取り込みは、承認をいただいてから行います。</b></Alert>
      <div className="grid gap-4 md:grid-cols-2">
        {canStaff ? <UploadCard kind="staff" title="① スタッフ（全7院）" headers={STAFF_HEADERS} hint="スタッフIDとログインIDを登録し、ID・PASSを発行します。POSで使っているログインIDは、そのアカウントに紐づけます。" /> : null}
        {canLeave ? <UploadCard kind="leave_balance" title="② 有給・振休の残数" headers={BALANCE_HEADERS} hint="付与ごとに1行（前年分と今年分は別の行）。履歴が分からない残数は「移行時点の残数」として記録します。先に①でスタッフを登録してください。" /> : null}
      </div>
      <Card>
        <CardHeader><CardTitle>これまでの取り込み</CardTitle></CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-stone-100">
            {(batches ?? []).map((b) => (
              <li key={b.id}>
                <Link href={`/admin/import/${b.id}`} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm hover:bg-stone-50">
                  <Badge>{b.kind === "staff" ? "スタッフ" : "残数"}</Badge><b>{b.file_name}</b>
                  <span className="text-stone-500">{b.row_count}行{b.error_count ? `（エラー${b.error_count}行）` : ""}</span>
                  <span className="ml-auto flex items-center gap-2"><Badge tone={STATUS[b.status].tone}>{STATUS[b.status].text}</Badge><span className="text-xs text-stone-500">{formatJstDateTime(b.created_at)}</span></span>
                </Link>
              </li>
            ))}
            {(batches ?? []).length === 0 ? <li className="px-4 py-6 text-center text-sm text-stone-500">まだありません</li> : null}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
