import Link from "next/link";
import { notFound } from "next/navigation";
import { ackDoc, addConflictAction, resolveConflictAction, reviewDoc, reviseDoc } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { Shell } from "@/components/Shell";
import { Badge, btn, btnDanger, btnGhost, Card, fmtDate, fmtDateTime, ImportanceBadge, input, label, StatusBadge } from "@/components/ui";
import { requireActor } from "@/lib/auth";
import { canAck, canDo, canEditVersion, canManageConflicts, canRevise, type ReviewAction } from "@/lib/authz";
import { categoryLabel, clinicName, KIND_LABEL, OPEN_STATUSES, POSITION_LABEL, type Position } from "@/lib/config";
import { sql } from "@/lib/db";
import { getDocDetail, info } from "@/lib/repo/docs";

const ACTION_LABEL: Record<ReviewAction, string> = {
  submit: "GM確認に出す", gm_approve: "GM確認OK（社長承認へ）", president_approve: "承認して公開する", return: "差し戻す",
  legal_hold: "法令確認待ちにする", legal_clear: "社労士確認済み（GM確認へ戻す）", archive: "廃止する",
};
const REVIEW_LABEL: Record<ReviewAction, string> = {
  submit: "提出", gm_approve: "GM確認OK", president_approve: "社長承認・公開", return: "差し戻し", legal_hold: "法令確認待ち", legal_clear: "社労士確認済み", archive: "廃止",
};

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  return { title: decodeURIComponent((await params).code) };
}

export default async function DocPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ v?: string; done?: string }> }) {
  const actor = await requireActor();
  const code = decodeURIComponent((await params).code);
  const d = await getDocDetail(sql(), actor, code);
  if (!d) notFound();
  const sp = await searchParams;
  const vNo = Number(sp.v) || null;
  const done = sp.done && sp.done in REVIEW_LABEL ? REVIEW_LABEL[sp.done as ReviewAction] : null;
  const current = d.versions.find((v) => v.id === d.doc.current_version_id) ?? null;
  const open = d.versions.find((v) => OPEN_STATUSES.includes(v.status)) ?? null;
  const v = (vNo && d.versions.find((x) => x.version_no === vNo)) || current || open || d.versions[0];
  const vi = info(d.doc, v);
  const acked = d.ackedVersionIds.includes(v.id);
  const approvedBy = d.reviews.find((r) => r.version_id === v.id && r.action === "president_approve");
  const actions = (["submit", "gm_approve", "president_approve", "legal_hold", "legal_clear", "return", "archive"] as ReviewAction[]).filter((a) => canDo(actor, a, vi));
  const conflicts = d.conflicts.filter((c) => c.version_id === v.id);
  const original = v.original_text ?? (v.version_no > 1 ? d.versions.find((x) => x.version_no === 1)?.original_text : null) ?? null;

  return (
    <Shell actor={actor} active={d.doc.kind === "rule" ? "rules" : "manual"}>
      <div className="mb-2 text-sm"><Link href={d.doc.kind === "rule" ? "/rules" : `/manual?kind=${d.doc.kind}`} className="text-navy underline">← {KIND_LABEL[d.doc.kind]}</Link></div>
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
        <span className="font-mono">{d.doc.code}</span><ImportanceBadge v={v.importance} /><span>{categoryLabel(v.category)}</span>
        <span>・第{v.version_no}版</span><StatusBadge status={v.status} />
        {d.doc.source === "google_doc" && <Badge>既存マニュアル {d.doc.source_ref}</Badge>}
        {d.doc.source === "proposal" && <Badge>新規提案</Badge>}
      </div>
      <h1 className="mb-3 text-xl font-bold leading-snug text-navy">{v.title}</h1>
      {done && <p role="status" className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">「{done}」を記録しました</p>}

      {current && v.id !== current.id && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">これは未公開（または旧版）の第{v.version_no}版です。<Link className="underline" href={`/docs/${code}?v=${current.version_no}`}>公開中の第{current.version_no}版を見る</Link></p>
      )}
      {open && v.id !== open.id && (
        <p className="mb-3 rounded-lg bg-navy-50 px-3 py-2 text-sm text-navy">改訂中の第{open.version_no}版（{open.status === "legal_hold" ? "法令確認待ち" : "未公開"}）があります。<Link className="underline" href={`/docs/${code}?v=${open.version_no}`}>見る</Link></p>
      )}
      {d.doc.import_note && v.status !== "published" && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{d.doc.import_note}</p>
      )}

      <Card>
        <div className="doc-body text-[15px]">{v.body}</div>
      </Card>

      {v.status === "published" && canAck(actor, vi) && (
        <div className="mb-4">
          {acked ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-3 text-center text-sm font-bold text-emerald-800">確認済みです</p>
          ) : (
            <form action={ackDoc}>
              <input type="hidden" name="versionId" value={v.id} />
              <button className={`${btn} w-full py-3 text-base`}>内容を確認しました</button>
            </form>
          )}
        </div>
      )}

      <Card title="この項目について">
        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-neutral-500">適用対象</dt>
          <dd>{v.target_positions.length ? v.target_positions.map((p) => POSITION_LABEL[p as Position]).join("・") : "全員"}</dd>
          <dt className="text-neutral-500">適用店舗</dt>
          <dd>{v.target_clinics.length ? v.target_clinics.map(clinicName).join("・") : "全院"}</dd>
          <dt className="text-neutral-500">施行日</dt><dd>{fmtDate(v.effective_on)}</dd>
          <dt className="text-neutral-500">承認者</dt><dd>{approvedBy ? `${approvedBy.actor_name}（${fmtDate(approvedBy.created_at)}）` : "未承認"}</dd>
          <dt className="text-neutral-500">最終更新</dt><dd>{fmtDateTime(v.updated_at)}</dd>
          {d.ackCount[v.id] !== undefined && (<><dt className="text-neutral-500">確認済み</dt><dd>{d.ackCount[v.id]}人</dd></>)}
        </dl>
        {!!d.links.length && (
          <div className="mt-3 border-t border-neutral-100 pt-3 text-sm">
            <div className="mb-1 text-neutral-500">関連</div>
            <ul className="space-y-1">
              {d.links.map((l, i) => (
                <li key={i}>{l.code ? <Link href={`/docs/${l.code}`} className="text-navy underline">{l.code} {l.title}</Link> : <span>申請：{l.form_type}</span>}
                  <span className="ml-1 text-xs text-neutral-500">{l.relation === "source_section" ? "（原文の項目）" : l.relation === "related_rule" ? "（この項目から作ったルール）" : ""}</span></li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {(original || d.sourceText) && (
        <details className="mb-4 rounded-xl border border-neutral-200 px-4 py-3">
          <summary className="cursor-pointer text-sm font-bold text-navy">原文（既存マニュアルのまま）</summary>
          {original && <div className="doc-body mt-3 border-l-4 border-neutral-300 pl-3 text-sm text-neutral-800">{original}</div>}
          {d.sourceText && d.sourceText !== original && (
            <>
              <div className="mt-3 text-xs text-neutral-500">取り出し元の項目全体（{d.doc.source_ref}）</div>
              <div className="doc-body mt-1 border-l-4 border-neutral-200 pl-3 text-sm text-neutral-700">{d.sourceText}</div>
            </>
          )}
        </details>
      )}

      {(conflicts.length > 0 || (canManageConflicts(actor) && OPEN_STATUSES.includes(v.status))) && (
        <Card title="既存ルールとの矛盾">
          {conflicts.map((c) => (
            <div key={c.id} className="mb-3 rounded-lg border border-neutral-200 p-3 text-sm">
              <div className="flex items-center gap-2"><Badge tone={c.status === "open" ? "red" : "green"}>{c.status === "open" ? "未解決" : "解決済み"}</Badge>
                <Link href={`/docs/${c.conflicts_with_code}`} className="text-navy underline">{c.conflicts_with_code} {c.conflicts_with_title}</Link></div>
              <p className="mt-1 whitespace-pre-wrap">{c.note}</p>
              {c.resolution && <p className="mt-1 whitespace-pre-wrap text-emerald-800">解決：{c.resolution}</p>}
              {c.status === "open" && canManageConflicts(actor) && (
                <ActionForm action={resolveConflictAction} className="mt-2 space-y-2">
                  <input type="hidden" name="conflictId" value={c.id} /><input type="hidden" name="code" value={code} />
                  <textarea name="resolution" className={input} rows={2} placeholder="どう解決したか（例：原文を正とする）" required />
                  <button className={btnGhost}>解決したことにする</button>
                </ActionForm>
              )}
            </div>
          ))}
          {canManageConflicts(actor) && OPEN_STATUSES.includes(v.status) && (
            <ActionForm action={addConflictAction} className="space-y-2">
              <input type="hidden" name="versionId" value={v.id} /><input type="hidden" name="code" value={code} />
              <p className="text-xs text-neutral-500">既存のルール・原文と食い違う場合は記録します。解決するまで公開できません。</p>
              <input name="conflictCode" className={input} placeholder="食い違う項目のID（例：MAN-S35）" required />
              <textarea name="note" className={input} rows={2} placeholder="どこが食い違うか" required />
              <button className={btnGhost}>矛盾を記録する</button>
            </ActionForm>
          )}
        </Card>
      )}

      {(actions.length > 0 || canEditVersion(actor, vi) || (canRevise(actor) && !open && current)) && (
        <Card title="操作">
          <div className="mb-3 flex flex-wrap gap-2">
            {canEditVersion(actor, vi) && <Link href={`/docs/${code}/edit`} className={btnGhost}>この版を編集</Link>}
            {canRevise(actor) && !open && current && (
              <form action={reviseDoc}><input type="hidden" name="code" value={code} /><button className={btnGhost}>改訂する（新しい版を作る）</button></form>
            )}
          </div>
          {actions.length > 0 && (
            <ActionForm action={reviewDoc} className="space-y-3">
              <input type="hidden" name="versionId" value={v.id} />
              <div>
                <label className={label} htmlFor="comment">コメント（差し戻し・法令確認待ちは理由が必須）</label>
                <textarea id="comment" name="comment" className={input} rows={2} />
              </div>
              {actions.includes("legal_clear") && (
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={label} htmlFor="er">確認した社労士</label><input id="er" name="externalReviewer" className={input} /></div>
                  <div><label className={label} htmlFor="ed">確認日</label><input id="ed" name="externalCheckedOn" type="date" className={input} /></div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {actions.map((a) => (
                  <button key={a} name="action" value={a} className={a === "return" || a === "archive" || a === "legal_hold" ? btnDanger : btn}>{ACTION_LABEL[a]}</button>
                ))}
              </div>
            </ActionForm>
          )}
        </Card>
      )}

      <Card title="改訂履歴">
        <ul className="space-y-2 text-sm">
          {d.versions.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2">
              <Link href={`/docs/${code}?v=${x.version_no}`} className={`font-bold ${x.id === v.id ? "text-navy" : "text-neutral-700 underline"}`}>第{x.version_no}版</Link>
              <StatusBadge status={x.status} />
              <span className="text-neutral-500">{x.published_at ? `公開 ${fmtDate(x.published_at)}` : `作成 ${fmtDate(x.created_at)}`}</span>
              {x.change_summary && <span className="text-neutral-700">— {x.change_summary}</span>}
            </li>
          ))}
        </ul>
        {!!d.reviews.length && (
          <ol className="mt-3 space-y-1.5 border-t border-neutral-100 pt-3 text-xs text-neutral-700">
            {d.reviews.map((r) => (
              <li key={r.id}>
                <span className="text-neutral-500">{fmtDateTime(r.created_at)}</span>　第{d.versions.find((x) => x.id === r.version_id)?.version_no}版
                <b>{REVIEW_LABEL[r.action]}</b>　{r.actor_name ?? "—"}{r.via_name && `（${r.via_name} の代理）`}
                {r.external_reviewer && `　確認：${r.external_reviewer}（${fmtDate(r.external_checked_on)}）`}
                {r.comment && <div className="whitespace-pre-wrap pl-4 text-neutral-600">{r.comment}</div>}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </Shell>
  );
}
