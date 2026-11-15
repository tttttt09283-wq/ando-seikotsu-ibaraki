import { notFound } from "next/navigation";
import { proposeDoc } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { Shell } from "@/components/Shell";
import { VersionFields } from "@/components/VersionFields";
import { btn, Card, input, label, PageTitle } from "@/components/ui";
import { requireActor } from "@/lib/auth";
import { canPropose, isTop } from "@/lib/authz";
import { KIND_LABEL, KINDS, type Kind } from "@/lib/config";

export const metadata = { title: "新しい提案" };

export default async function NewDocPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const actor = await requireActor();
  if (!canPropose(actor)) notFound();
  const k = (await searchParams).kind;
  const kind: Kind = (KINDS as readonly string[]).includes(k ?? "") ? (k as Kind) : "rule";
  const kinds = KINDS.filter((x) => x !== "manager_manual" || isTop(actor));
  return (
    <Shell actor={actor} active={kind === "rule" ? "rules" : "manual"}>
      <PageTitle title="新しい提案" lead="提案は「新規提案」として登録され、GM確認 → 社長承認 を経て公開されます。既存マニュアルの原文は変わりません。" />
      <ActionForm action={proposeDoc} className="space-y-4">
        <div>
          <label className={label} htmlFor="kind">種類</label>
          <select id="kind" name="kind" className={input} defaultValue={kind}>
            {kinds.map((x) => <option key={x} value={x}>{KIND_LABEL[x]}</option>)}
          </select>
        </div>
        <VersionFields />
        <Card title="既存ルール・原文と食い違う場合">
          <p className="mb-2 text-xs text-neutral-500">食い違う項目があれば書いてください。GMが解決するまで公開されません（勝手に上書きされません）。</p>
          <input name="conflictCode" className={`${input} mb-2`} placeholder="項目のID（例：MAN-S35）" />
          <textarea name="conflictNote" className={input} rows={2} placeholder="どこが食い違うか" />
        </Card>
        <button className={`${btn} w-full`}>下書きとして保存</button>
      </ActionForm>
    </Shell>
  );
}
