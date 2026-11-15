import Link from "next/link";
import { notFound } from "next/navigation";
import { saveVersion } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { Shell } from "@/components/Shell";
import { VersionFields } from "@/components/VersionFields";
import { btn, PageTitle } from "@/components/ui";
import { requireActor } from "@/lib/auth";
import { canEditVersion } from "@/lib/authz";
import { sql } from "@/lib/db";
import { getDocDetail, info } from "@/lib/repo/docs";

export const metadata = { title: "編集" };

export default async function EditPage({ params }: { params: Promise<{ code: string }> }) {
  const actor = await requireActor();
  const code = decodeURIComponent((await params).code);
  const d = await getDocDetail(sql(), actor, code);
  const v = d?.versions.find((x) => canEditVersion(actor, info(d.doc, x)));
  if (!d || !v) notFound();
  return (
    <Shell actor={actor} active={d.doc.kind === "rule" ? "rules" : "manual"}>
      <div className="mb-2 text-sm"><Link href={`/docs/${code}?v=${v.version_no}`} className="text-navy underline">← 戻る</Link></div>
      <PageTitle title={`${code} 第${v.version_no}版を編集`} lead="保存しても公開はされません。編集が終わったら「GM確認に出す」を押してください。" />
      <ActionForm action={saveVersion} className="space-y-4">
        <input type="hidden" name="versionId" value={v.id} />
        <VersionFields v={v} />
        <button className={`${btn} w-full`}>保存する</button>
      </ActionForm>
    </Shell>
  );
}
