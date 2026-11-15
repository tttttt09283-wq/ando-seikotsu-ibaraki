import Link from "next/link";
import { notFound } from "next/navigation";
import { addAssignmentAction, addDelegationAction, addMemberAction, endAssignmentAction, retireAction, setAreaAction, syncMembersAction } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { Shell } from "@/components/Shell";
import { Badge, btn, btnDanger, btnGhost, Card, fmtDate, input, label, PageTitle } from "@/components/ui";
import { requireActor } from "@/lib/auth";
import { canAdmin, canAssignTop } from "@/lib/authz";
import { CLINICS, clinicName, COMPANY_WIDE, POSITION_LABEL, POSITIONS } from "@/lib/config";
import { sql } from "@/lib/db";
import { listMembers, presidentExists, type MemberListRow } from "@/lib/repo/members";

export const metadata = { title: "管理者設定" };

const todayJst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const isCurrent = (x: { valid_from: string; valid_to: string | null }, t: string) => x.valid_from <= t && (!x.valid_to || x.valid_to >= t);

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ clinic?: string; q?: string }> }) {
  const actor = await requireActor();
  if (!canAdmin(actor)) notFound();
  const sp = await searchParams;
  const today = todayJst();
  const all = await listMembers(sql());
  const topOk = canAssignTop(actor, await presidentExists(sql()));
  const positions = POSITIONS.filter((p) => topOk || !COMPANY_WIDE.includes(p));
  const shown = all.filter((m) =>
    (!sp.clinic || (sp.clinic === "none" ? !m.assignments.some((a) => isCurrent(a, today)) : m.assignments.some((a) => a.clinic_id === sp.clinic && isCurrent(a, today)))) &&
    (!sp.q || m.name.includes(sp.q)));
  const gms = all.filter((m) => m.assignments.some((a) => a.position === "gm" && isCurrent(a, today)));
  const nameOf = (id: string) => all.find((m) => m.id === id)?.name ?? "—";

  return (
    <Shell actor={actor} active="admin">
      <PageTitle title="管理者設定" lead="スタッフの所属・役職・兼務・担当エリア・代理承認・退職を管理します。変更はすべて監査ログに残ります。">
        <div className="flex gap-2">
          <Link href="/admin/import" className={btnGhost}>原文の取り込み</Link>
          <Link href="/admin/audit" className={btnGhost}>監査ログ</Link>
        </div>
      </PageTitle>

      <Card title="組織（今日時点）">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-neutral-500"><th className="py-1 pr-2">院</th><th className="pr-2">担当マネージャー</th><th className="pr-2">院長</th><th>人数</th></tr></thead>
            <tbody>
              {CLINICS.map((c) => {
                const area = all.find((m) => m.areas.some((a) => a.clinic_id === c.id && isCurrent(a, today)));
                const mgr = all.filter((m) => m.assignments.some((a) => a.clinic_id === c.id && a.position === "manager" && isCurrent(a, today)));
                const n = all.filter((m) => m.is_active && m.assignments.some((a) => a.clinic_id === c.id && isCurrent(a, today))).length;
                return (
                  <tr key={c.id} className="border-t border-neutral-100">
                    <td className="py-1.5 pr-2 font-bold"><Link href={`/admin?clinic=${c.id}`} className="underline">{c.name}</Link></td>
                    <td className="pr-2">{area ? area.name : <span className="text-red-700">未設定</span>}</td>
                    <td className="pr-2">{mgr.map((m) => m.name).join("・") || <span className="text-neutral-400">—</span>}</td>
                    <td>{n}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-neutral-500">社長・GM：{all.filter((m) => m.assignments.some((a) => COMPANY_WIDE.includes(a.position) && isCurrent(a, today))).map((m) => `${m.name}（${POSITION_LABEL[m.assignments.find((a) => COMPANY_WIDE.includes(a.position) && isCurrent(a, today))!.position]}）`).join("、") || "未設定"}</p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="台帳から取り込む">
          <ActionForm action={syncMembersAction}>
            <p className="mb-2 text-xs text-neutral-500">予約管理の台帳（スタッフ一覧）から、まだ登録されていない人を追加します。所属のない人には台帳の院・役職で所属を作ります。すでに登録済みの人は変更しません。</p>
            <button className={btn}>台帳から取り込む</button>
          </ActionForm>
        </Card>
        <Card title="スタッフを追加（台帳にいない人）">
          <ActionForm action={addMemberAction} className="space-y-2">
            <input name="name" className={input} placeholder="氏名（例：安藤 太郎）" required />
            <div className="grid grid-cols-2 gap-2">
              <select name="employmentType" className={input}><option value="regular">正社員</option><option value="part_time">パート・アルバイト</option></select>
              <input name="joinedOn" type="date" className={input} aria-label="入社日" />
            </div>
            <button className={btnGhost}>追加する</button>
          </ActionForm>
        </Card>
      </div>

      <Card title="GM確認の代理">
        <ActionForm action={addDelegationAction} className="grid gap-2 md:grid-cols-2">
          <select name="fromMember" className={input} required>{gms.map((m) => <option key={m.id} value={m.id}>{m.name}（GM）の確認を</option>)}</select>
          <select name="toMember" className={input} required>{all.filter((m) => m.is_active).map((m) => <option key={m.id} value={m.id}>{m.name} が代理する</option>)}</select>
          <input name="validFrom" type="date" className={input} defaultValue={today} required aria-label="開始日" />
          <input name="validTo" type="date" className={input} required aria-label="終了日" />
          <input name="reason" className={`${input} md:col-span-2`} placeholder="理由（例：GM休暇中）" />
          <button className={btnGhost}>代理を設定する</button>
        </ActionForm>
      </Card>

      <Card title={`スタッフ（${shown.length}人）`}>
        <form className="mb-3 flex flex-wrap gap-2">
          <select name="clinic" defaultValue={sp.clinic ?? ""} className={`${input} w-auto`}>
            <option value="">全員</option>
            {CLINICS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="none">所属なし</option>
          </select>
          <input name="q" defaultValue={sp.q} className={`${input} w-40`} placeholder="名前" />
          <button className={btnGhost}>絞り込む</button>
        </form>
        <ul>
          {shown.map((m) => <MemberItem key={m.id} m={m} today={today} positions={positions} nameOf={nameOf} />)}
        </ul>
      </Card>
    </Shell>
  );
}

function MemberItem({ m, today, positions, nameOf }: { m: MemberListRow; today: string; positions: readonly (typeof POSITIONS)[number][]; nameOf: (id: string) => string }) {
  const current = m.assignments.filter((a) => isCurrent(a, today));
  const isManagerLike = m.assignments.some((a) => (a.position === "bm" || a.position === "gm") && (!a.valid_to || a.valid_to >= today));
  void nameOf;
  return (
    <li className="border-b border-neutral-100 last:border-0">
      <details>
        <summary className="flex cursor-pointer flex-wrap items-center gap-2 py-3">
          <span className="font-bold">{m.name}</span>
          {!m.is_active && <Badge>退職</Badge>}
          {m.retired_on && m.is_active && <Badge tone="red">退職予定 {fmtDate(m.retired_on)}</Badge>}
          {m.is_system_admin && <Badge tone="navy">管理者</Badge>}
          {m.clinic_staff_id ? <Badge>メールログイン</Badge> : null}
          <span className="text-xs text-neutral-600">
            {current.length ? current.map((a) => `${clinicName(a.clinic_id)}・${POSITION_LABEL[a.position]}${a.is_primary ? "" : "（兼務）"}`).join("／") : "所属なし"}
          </span>
        </summary>
        <div className="space-y-4 pb-4 pl-1">
          <div>
            <div className="mb-1 text-xs font-bold text-neutral-500">所属・役職の履歴</div>
            <ul className="space-y-2 text-sm">
              {m.assignments.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  <span className={isCurrent(a, today) ? "font-bold" : "text-neutral-500"}>{clinicName(a.clinic_id)}・{POSITION_LABEL[a.position]}{a.is_primary ? "" : "（兼務）"}</span>
                  <span className="text-xs text-neutral-500">{fmtDate(a.valid_from)}〜{a.valid_to ? fmtDate(a.valid_to) : ""}</span>
                  {!a.valid_to && (
                    <ActionForm action={endAssignmentAction} className="flex items-center gap-1">
                      <input type="hidden" name="assignmentId" value={a.id} />
                      <input name="validTo" type="date" defaultValue={today} className="rounded border border-neutral-300 px-2 py-1 text-sm" aria-label="終了日" />
                      <button className="rounded border border-neutral-400 px-2 py-1 text-xs">終了</button>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
            {!!m.areas.length && (
              <div className="mt-2 text-sm">担当エリア：{m.areas.map((a) => `${clinicName(a.clinic_id)}（${fmtDate(a.valid_from)}〜${a.valid_to ? fmtDate(a.valid_to) : ""}）`).join("、")}</div>
            )}
          </div>

          {m.is_active && (
            <ActionForm action={addAssignmentAction} className="grid grid-cols-2 gap-2 rounded-lg bg-neutral-50 p-3">
              <div className="col-span-2 text-xs font-bold text-neutral-600">所属を追加（異動は「終了」＋「追加」、兼務は主所属のチェックを外して追加）</div>
              <input type="hidden" name="memberId" value={m.id} />
              <select name="position" className={input} defaultValue="staff">{positions.map((p) => <option key={p} value={p}>{POSITION_LABEL[p]}</option>)}</select>
              <select name="clinicId" className={input} defaultValue=""><option value="">院（社長・GMは不要）</option>{CLINICS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <input name="validFrom" type="date" className={input} defaultValue={today} required aria-label="開始日" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPrimary" defaultChecked={!current.length} className="size-4" />主所属</label>
              <button className={`${btnGhost} col-span-2`}>追加する</button>
            </ActionForm>
          )}

          {m.is_active && isManagerLike && (
            <ActionForm action={setAreaAction} className="space-y-2 rounded-lg bg-neutral-50 p-3">
              <div className="text-xs font-bold text-neutral-600">担当エリア（その院の「マネージャー」になります。前の担当は前日で終わります）</div>
              <input type="hidden" name="memberId" value={m.id} />
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                {CLINICS.map((c) => <label key={c.id} className="flex items-center gap-1.5"><input type="checkbox" name="clinicId" value={c.id} className="size-4" defaultChecked={m.areas.some((a) => a.clinic_id === c.id && isCurrent(a, today))} />{c.name}</label>)}
              </div>
              <input name="validFrom" type="date" className={input} defaultValue={today} required aria-label="開始日" />
              <button className={btnGhost}>担当エリアを設定</button>
            </ActionForm>
          )}

          {m.is_active && (
            <ActionForm action={retireAction} className="space-y-2 rounded-lg border border-red-200 p-3" confirmText={`${m.name} さんの退職を登録します。よろしいですか？`}>
              <div className="text-xs font-bold text-red-800">退職（退職日の翌日からログインできなくなります。記録は残ります）</div>
              <input type="hidden" name="memberId" value={m.id} />
              <input name="retiredOn" type="date" className={input} required aria-label="退職日" />
              {m.auth_uid && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="banAuth" defaultChecked className="size-4" />メールアドレスのログイン（予約管理を含む）も止める</label>}
              <button className={btnDanger}>退職を登録</button>
            </ActionForm>
          )}
        </div>
      </details>
    </li>
  );
}
