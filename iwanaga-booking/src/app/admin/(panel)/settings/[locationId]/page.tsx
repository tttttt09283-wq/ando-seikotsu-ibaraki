import Link from "next/link";
import { notFound } from "next/navigation";
import ActionForm from "@/components/admin/ActionForm";
import { Card } from "@/components/admin/parts";
import { requireAdminPage } from "@/lib/auth/admin";
import { assertPermission, hasPermission } from "@/lib/auth/permissions";
import { locationGate } from "@/lib/domain/gate";
import { getRepo } from "@/lib/repo";
import { formatJst, yen } from "@/lib/time";
import {
  addRuleAction,
  bookingEnabledAction,
  companyApprovalAction,
  deleteRuleAction,
  locationSettingsAction,
  locationTextsAction,
  openingReadyAction,
  publishServiceAction,
  saveServiceAction,
} from "../../../actions";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

export default async function LocationSettings({ params }: { params: Promise<{ locationId: string }> }) {
  const admin = await requireAdminPage();
  const { locationId } = await params;
  const repo = getRepo();
  const l = await repo.getLocation(locationId);
  if (!l) notFound();
  assertPermission(admin, "settings", l.controller);
  const [rules, services] = await Promise.all([repo.listRules(l.id), repo.listServices(l.id)]);
  const gate = locationGate(l);
  const canGate = hasPermission(admin, "approve_gates", l.controller);
  const inp = "w-full border border-line px-2 py-2 text-sm";
  const lh = { location_id: l.id };
  const weekly = rules.filter((r) => r.weekday !== null).sort((a, b) => a.weekday! - b.weekday! || (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  const dated = rules.filter((r) => r.specific_date !== null).sort((a, b) => a.specific_date!.localeCompare(b.specific_date!));

  return (
    <div className="space-y-5">
      <Link href="/admin/settings" className="text-xs text-mist underline">← 場所・メニュー</Link>
      <h1 className="font-serif text-xl tracking-[0.1em]">{l.name}</h1>

      <Card title="予約受付の可否">
        <p className={`mb-4 text-sm ${gate.ok ? "text-ok" : "text-warn"}`}>現在：{gate.ok ? "受付中" : gate.reason}</p>
        {!canGate && <p className="text-xs text-mist">受付の可否を変更できるのはオーナーだけです。</p>}
        {canGate && (
          <div className="grid gap-5 md:grid-cols-2">
            {l.kind === "home" ? (
              <div className="space-y-2">
                <p className="text-sm">開業許可・準備完了：<strong>{l.opening_ready ? "完了" : "未完了"}</strong></p>
                <p className="text-xs text-ink-soft">開設届の提出・保健所の確認・設備・賠償責任保険など、開業の準備がすべて整ってから「完了」にしてください。それまで予約は受け付けません。</p>
                {l.opening_ready ? (
                  <ActionForm action={openingReadyAction} hidden={{ ...lh, value: "false" }} tone="danger" label="準備完了を取り消す（受付も停止）"><input type="hidden" name="note" value="" /></ActionForm>
                ) : (
                  <ActionForm action={openingReadyAction} hidden={{ ...lh, value: "true" }} label="開業準備完了として記録する" confirmMessage="開業の許可・準備がすべて整っていることを確認しましたか？">
                    <input name="note" required placeholder="確認内容（例：開設届提出 2026-12-01）" className={inp} />
                  </ActionForm>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm">会社の正式承認：<strong>{l.company_approved ? "承認済み" : "未承認"}</strong></p>
                {l.company_approved && <p className="text-xs text-mist">{l.company_approval_note}（{l.company_approved_at && formatJst(l.company_approved_at)}）</p>}
                <p className="text-xs text-ink-soft">
                  勤務先の予約を岩永個人の公式LINE・このシステムで扱うことについて、会社の正式な承認を得てから記録してください。承認前は予約を受け付けません。個人情報の管理主体・利用目的・閲覧範囲の表示内容も会社と確認してください。
                </p>
                {l.company_approved ? (
                  <ActionForm action={companyApprovalAction} hidden={{ ...lh, value: "false" }} tone="danger" label="承認を取り消す（受付も停止）"><input type="hidden" name="note" value="" /></ActionForm>
                ) : (
                  <ActionForm action={companyApprovalAction} hidden={{ ...lh, value: "true" }} label="会社承認を記録する" confirmMessage="会社から正式な承認を得ていることを確認しましたか？">
                    <input name="note" required placeholder="承認者・承認日・書面の有無" className={inp} />
                  </ActionForm>
                )}
              </div>
            )}
            <div className="space-y-2">
              <p className="text-sm">予約受付：<strong>{l.booking_enabled ? "開始" : "停止中"}</strong></p>
              <p className="text-xs text-ink-soft">公開承認したメニューがあり、営業時間を設定してから開始してください。</p>
              <ActionForm
                action={bookingEnabledAction}
                hidden={{ ...lh, value: l.booking_enabled ? "false" : "true" }}
                tone={l.booking_enabled ? "danger" : "primary"}
                label={l.booking_enabled ? "予約受付を停止する" : "予約受付を開始する"}
              />
            </div>
          </div>
        )}
      </Card>

      <Card title="メニュー・料金">
        <p className="mb-3 text-xs text-ink-soft">
          料金はすべて税込で登録します。{l.kind === "workplace" ? "勤務先のメニューは、会社が承認した料金だけを登録・公開してください。" : "提案価格は「公開承認」するまで公開されません。"}
          料金・時間を変更すると非公開に戻り、再度の公開承認が必要になります。
        </p>
        <div className="space-y-4">
          {services.map((s) => (
            <div key={s.id} className="grid gap-3 border border-line p-3 md:grid-cols-[1fr_16rem]">
              <ActionForm action={saveServiceAction} hidden={{ ...lh, service_id: s.id }} label="保存" confirm={false}>
                <ServiceFields s={s} inp={inp} />
              </ActionForm>
              <div className="space-y-2 text-sm">
                <p>
                  {s.is_published ? <span className="text-ok">公開中</span> : <span className="text-warn">非公開</span>}
                  <span className="ml-2 text-xs text-mist">{s.price_status === "approved" ? `承認済み：${s.price_approval_note ?? ""}` : "提案価格（未承認）"}</span>
                </p>
                <p className="text-xs">{s.price_tax_included !== null ? `${yen(s.price_tax_included)}（税込）・${s.duration_minutes}分` : "料金未設定"}</p>
                {canGate &&
                  (s.is_published ? (
                    <ActionForm action={publishServiceAction} hidden={{ service_id: s.id, value: "false" }} label="非公開にする"><input type="hidden" name="note" value="" /></ActionForm>
                  ) : (
                    <ActionForm action={publishServiceAction} hidden={{ service_id: s.id, value: "true" }} tone="primary" label="料金を承認して公開" confirmMessage={`${s.name} ${s.price_tax_included !== null ? yen(s.price_tax_included) : ""}（税込）・${s.duration_minutes}分 を公開します。`}>
                      <input name="note" required={l.kind === "workplace"} placeholder={l.kind === "workplace" ? "会社承認の記録（必須）" : "メモ（任意）"} className={inp} />
                    </ActionForm>
                  ))}
              </div>
            </div>
          ))}
          <details className="border border-dashed border-line p-3">
            <summary className="cursor-pointer text-sm">メニューを追加する</summary>
            <div className="mt-3">
              <ActionForm action={saveServiceAction} hidden={{ ...lh, service_id: "" }} label="追加（非公開で登録）" confirm={false}>
                <ServiceFields s={null} inp={inp} />
              </ActionForm>
            </div>
          </details>
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="営業時間（毎週）">
          <ul className="mb-3 divide-y divide-line text-sm">
            {weekly.length === 0 && <li className="py-2 text-mist">未設定（予約枠は表示されません）</li>}
            {weekly.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                <span>{WEEK[r.weekday!]}曜 {r.start_time}〜{r.end_time}</span>
                <div className="w-20"><ActionForm action={deleteRuleAction} hidden={{ ...lh, rule_id: r.id }} label="削除" tone="danger" /></div>
              </li>
            ))}
          </ul>
          <ActionForm action={addRuleAction} hidden={{ ...lh, kind: "weekly" }} label="追加" confirm={false}>
            <div className="grid grid-cols-3 gap-2">
              <select name="weekday" className={inp}>{WEEK.map((w, i) => <option key={w} value={i}>{w}曜</option>)}</select>
              <input type="time" name="start_time" defaultValue="20:00" className={inp} />
              <input name="end_time" defaultValue="24:00" inputMode="numeric" pattern="([01][0-9]|2[0-3]):[0-5][0-9]|24:00" placeholder="24:00" title="終了時刻（例 24:00）" className={inp} />
            </div>
          </ActionForm>
        </Card>

        <Card title="休業日・特別営業日">
          <ul className="mb-3 divide-y divide-line text-sm">
            {dated.length === 0 && <li className="py-2 text-mist">なし</li>}
            {dated.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                <span>{r.specific_date} {r.is_closed ? "休業" : `${r.start_time}〜${r.end_time} 営業`} <span className="text-xs text-mist">{r.note}</span></span>
                <div className="w-20"><ActionForm action={deleteRuleAction} hidden={{ ...lh, rule_id: r.id }} label="削除" tone="danger" /></div>
              </li>
            ))}
          </ul>
          <ActionForm action={addRuleAction} hidden={lh} label="追加" confirm={false}>
            <div className="grid grid-cols-2 gap-2">
              <select name="kind" className={inp}><option value="date_closed">休業日</option><option value="date_open">この日だけの営業時間</option></select>
              <input type="date" name="date" required className={inp} />
              <input type="time" name="start_time" defaultValue="20:00" className={inp} />
              <input name="end_time" defaultValue="24:00" inputMode="numeric" pattern="([01][0-9]|2[0-3]):[0-5][0-9]|24:00" placeholder="24:00" title="終了時刻（例 24:00）" className={inp} />
              <input name="note" placeholder="メモ" className={`${inp} col-span-2`} />
            </div>
            <p className="text-xs text-mist">指定した日は、毎週の営業時間より優先されます（休業日は時刻不要）。</p>
          </ActionForm>
        </Card>
      </div>

      <Card title="受付ルール">
        <ActionForm action={locationSettingsAction} hidden={lh} label="保存" confirmMessage="受付ルールを変更します。既存の予約には影響しません。">
          <div className="grid grid-cols-2 gap-3 text-xs text-mist md:grid-cols-3">
            <label>前後のバッファ（分）<input type="number" name="buffer_minutes" min={0} max={240} defaultValue={l.buffer_minutes} className={inp} /></label>
            <label>他拠点との移動時間（分）<input type="number" name="travel_minutes" min={0} max={480} defaultValue={l.travel_minutes} className={inp} /></label>
            <label>受付締切（開始の何時間前）<input type="number" name="booking_deadline_hours" min={0} max={720} defaultValue={l.booking_deadline_hours} className={inp} /></label>
            <label>何日先まで受け付けるか<input type="number" name="max_advance_days" min={1} max={365} defaultValue={l.max_advance_days} className={inp} /></label>
            <label>1日の予約上限（0=上限なし）<input type="number" name="daily_limit" min={0} max={50} defaultValue={l.daily_limit} className={inp} /></label>
            <label>開始時刻の間隔（分）<input type="number" name="slot_interval_minutes" min={5} max={240} defaultValue={l.slot_interval_minutes} className={inp} /></label>
          </div>
        </ActionForm>
      </Card>

      <Card title="表示内容（予約フォーム・確定通知・個人情報の取扱い）">
        <ActionForm action={locationTextsAction} hidden={lh} label="保存" confirmMessage="公開ページと確定通知の文面が変わります。">
          <div className="grid gap-3 text-xs text-mist md:grid-cols-2">
            <label>名称<input name="name" defaultValue={l.name} className={inp} /></label>
            <label>短い名称<input name="short_name" defaultValue={l.short_name} className={inp} /></label>
            <label className="md:col-span-2">公開する所在地の表示<input name="public_area" defaultValue={l.public_area} className={inp} /></label>
            {l.kind === "home" && (
              <label className="md:col-span-2">
                詳細住所（予約確定した本人への確定通知にだけ記載。公開ページには表示しません）
                <input name="private_address" defaultValue={l.private_address ?? ""} className={inp} />
              </label>
            )}
            <label className="md:col-span-2">管理主体（個人情報の管理責任者）<input name="controller_name" defaultValue={l.controller_name} className={inp} /></label>
            <label className="md:col-span-2">利用目的<textarea name="privacy_purpose" rows={3} defaultValue={l.privacy_purpose} className={inp} /></label>
            <label className="md:col-span-2">閲覧できる人・保管<textarea name="privacy_access" rows={3} defaultValue={l.privacy_access} className={inp} /></label>
            <label className="md:col-span-2">キャンセル規定<textarea name="cancel_policy" rows={3} defaultValue={l.cancel_policy} className={inp} /></label>
            <label className="md:col-span-2">注意事項（確定通知に記載）<textarea name="precautions" rows={3} defaultValue={l.precautions} className={inp} /></label>
            <label className="md:col-span-2">変更・キャンセルの窓口（確定通知に記載）<input name="contact_info" defaultValue={l.contact_info} className={inp} /></label>
          </div>
          <p className="text-xs text-mist">医療効果を保証する表現（「必ず治る」「完治」など）は登録できません。</p>
        </ActionForm>
      </Card>
    </div>
  );
}

function ServiceFields({ s, inp }: { s: { name: string; description: string; duration_minutes: number; price_tax_included: number | null; sort_order: number } | null; inp: string }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-xs text-mist md:grid-cols-4">
      <label className="col-span-2">メニュー名<input name="name" required defaultValue={s?.name ?? ""} className={inp} /></label>
      <label>施術時間（分）<input type="number" name="duration_minutes" min={10} max={240} required defaultValue={s?.duration_minutes ?? 60} className={inp} /></label>
      <label>料金（税込・円）<input type="number" name="price_tax_included" min={0} defaultValue={s?.price_tax_included ?? ""} className={inp} /></label>
      <label className="col-span-2 md:col-span-3">説明<input name="description" defaultValue={s?.description ?? ""} className={inp} /></label>
      <label>表示順<input type="number" name="sort_order" min={0} defaultValue={s?.sort_order ?? 0} className={inp} /></label>
    </div>
  );
}
