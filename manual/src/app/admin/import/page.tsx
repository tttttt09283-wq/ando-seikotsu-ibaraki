import Link from "next/link";
import { notFound } from "next/navigation";
import { importManualAction } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { Shell } from "@/components/Shell";
import { btn, Card, fmtDateTime, input, label, PageTitle } from "@/components/ui";
import { requireActor } from "@/lib/auth";
import { canAdmin } from "@/lib/authz";
import { sql } from "@/lib/db";
import { RULES, SECTIONS, SOURCE } from "@/lib/import-config";

export const metadata = { title: "原文の取り込み" };

export default async function ImportPage() {
  const actor = await requireActor();
  if (!canAdmin(actor)) notFound();
  const history = await sql()<{ imported_at: Date; sha256: string; name: string | null; n: number }[]>`
    select i.imported_at, i.sha256, m.name, (select count(*)::int from mn_source_sections s where s.import_id = i.id) as n
    from mn_source_imports i left join mn_members m on m.id = i.imported_by order by i.imported_at desc limit 20`;
  return (
    <Shell actor={actor} active="admin">
      <div className="mb-2 text-sm"><Link href="/admin" className="text-navy underline">← 管理者設定</Link></div>
      <PageTitle title="既存マニュアル（原文）の取り込み" lead={`${SOURCE.name}を項目に分けて登録します。文言は一字も変えずに「原文」として保存し、変更できません。`} />
      <Card title="手順">
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Googleドキュメントを開き、「ファイル」→「ダウンロード」→「書式なしテキスト（.txt）」</li>
          <li>下でそのファイルを選んで「取り込む」</li>
          <li>{SECTIONS.length}項目はマニュアルとして「下書き」（法令確認が必要な{SECTIONS.filter((s) => s.status === "legal_hold").length}項目は「法令確認待ち」）、会社ルールの確定候補{RULES.length}件は「GM確認待ち」で登録されます</li>
          <li>何度取り込んでも、すでにある項目は上書きしません（原文が変わっていれば知らせます）</li>
        </ol>
      </Card>
      <Card title="取り込む">
        <ActionForm action={importManualAction} className="space-y-3">
          <div>
            <label className={label} htmlFor="file">書き出したファイル（.txt）</label>
            <input id="file" name="file" type="file" accept=".txt,text/plain" className={input} />
          </div>
          <details>
            <summary className="cursor-pointer text-sm text-navy">ファイルの代わりに本文を貼り付ける</summary>
            <textarea name="text" rows={6} className={`${input} mt-2`} />
          </details>
          <button className={`${btn} w-full`}>取り込む</button>
        </ActionForm>
      </Card>
      <Card title="取り込みの履歴">
        {history.length ? (
          <ul className="space-y-1 text-sm">
            {history.map((h) => <li key={h.sha256 + String(h.imported_at)}>{fmtDateTime(h.imported_at)}　{h.name ?? "—"}　{h.n}項目　<span className="font-mono text-xs text-neutral-500">{h.sha256.slice(0, 12)}</span></li>)}
          </ul>
        ) : <p className="text-sm text-neutral-500">まだ取り込んでいません</p>}
      </Card>
    </Shell>
  );
}
