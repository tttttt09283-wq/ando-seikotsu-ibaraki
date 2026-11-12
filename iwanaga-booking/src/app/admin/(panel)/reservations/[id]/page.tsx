import Link from "next/link";
import { notFound } from "next/navigation";
import ActionForm from "@/components/admin/ActionForm";
import { Card, NoticeBadge, StatusBadge } from "@/components/admin/parts";
import { requireAdminPage } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { lineMessagingConfigured } from "@/lib/config";
import { allowedTargets, STATUS_LABEL } from "@/lib/domain/status";
import { getRepo } from "@/lib/repo";
import { customerMessageText, kindLabel } from "@/lib/services/notifications";
import { getAdminReservationDetail, OperationError } from "@/lib/services/reservations";
import { formatJst, formatRange, jstDateKey, jstTime, yen } from "@/lib/time";
import {
  cancelAction,
  completeAction,
  confirmAction,
  deleteCustomerAction,
  manualMatchAction,
  markManualAction,
  proposeAction,
  resendAction,
} from "../../../actions";

export default async function ReservationDetail({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPage();
  const { id } = await params;
  let d;
  try {
    d = await getAdminReservationDetail(getRepo(), admin, id);
  } catch (e) {
    if (e instanceof OperationError) notFound();
    throw e;
  }
  const r = d.reservation;
  const can = (t: string) => allowedTargets(r.status, "admin").includes(t as never) && hasPermission(admin, "operate", r.controller);
  const hidden = { id: r.id, version: r.version };
  const summary = `${r.code}\n${d.location.short_name} ${formatRange(r.start_at, r.end_at)}\n${r.service_snapshot.name} ${yen(r.service_snapshot.price_tax_included)}（税込）`;
  const noticeKind = r.status === "confirmed" ? "confirmed" : r.status === "change_proposed" ? "change_proposed" : r.status === "cancelled" ? "cancelled" : null;
  const noticeText = noticeKind ? customerMessageText(r, d.location, noticeKind) : null;
  const input = "w-full border border-line px-2 py-2 text-sm";
  const lastNotice = noticeKind ? d.notices.find((x) => x.recipient === "customer" && x.kind === noticeKind) : undefined;

  return (
    <div className="space-y-5">
      <Link href="/admin/reservations" className="text-xs text-mist underline">
        ← 予約検索へ
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-xl">{r.code}</h1>
        <StatusBadge status={r.status} />
        <NoticeBadge status={r.notice_status} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="予約内容">
            <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
              <dt className="text-mist">状態</dt>
              <dd>{STATUS_LABEL[r.status]}</dd>
              <dt className="text-mist">施術場所</dt>
              <dd>
                {d.location.name} <span className="text-xs text-mist">（管理主体：{d.location.controller_name}）</span>
              </dd>
              <dt className="text-mist">日時</dt>
              <dd className="tabular-nums">
                {formatRange(r.start_at, r.end_at)}
                {r.previous_start_at && r.previous_end_at && <span className="block text-xs text-mist">変更前：{formatRange(r.previous_start_at, r.previous_end_at)}</span>}
              </dd>
              <dt className="text-mist">メニュー</dt>
              <dd>
                {r.service_snapshot.name}（{r.service_snapshot.duration_minutes}分）{yen(r.service_snapshot.price_tax_included)}（税込）
              </dd>
              <dt className="text-mist">LINE受付</dt>
              <dd>
                {r.line_received_at ? (
                  <>
                    {r.line_match_method === "manual" ? "手動照合済み" : "LINE受信を確認済み"} <span className="text-xs text-mist">{formatJst(r.line_received_at)}</span>
                  </>
                ) : (
                  <span className="text-warn">未確認（LINE送信待ち）</span>
                )}
                <span className="block text-xs text-mist">LINEアカウント連携：{d.lineLinked ? "あり（確定通知を自動送信できます）" : "なし"}</span>
              </dd>
              {r.hold_expires_at && (
                <>
                  <dt className="text-mist">仮押さえ期限</dt>
                  <dd>{formatJst(r.hold_expires_at)}</dd>
                </>
              )}
              {r.confirmed_at && (
                <>
                  <dt className="text-mist">確定</dt>
                  <dd>
                    {formatJst(r.confirmed_at)} <span className="text-xs text-mist">{r.confirmed_by}</span>
                  </dd>
                </>
              )}
              {r.cancelled_at && (
                <>
                  <dt className="text-mist">キャンセル</dt>
                  <dd>
                    {formatJst(r.cancelled_at)} {r.cancel_reason}
                  </dd>
                </>
              )}
              <dt className="text-mist">流入元</dt>
              <dd>{r.source ?? "—"}</dd>
              <dt className="text-mist">申込</dt>
              <dd>{formatJst(r.created_at)}</dd>
            </dl>
          </Card>

          <Card title="お客様">
            {d.customer && !d.customer.anonymized ? (
              <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
                <dt className="text-mist">お名前</dt>
                <dd>{d.customer.name}</dd>
                <dt className="text-mist">電話番号</dt>
                <dd>
                  <a href={`tel:${d.customer.phone}`} className="underline">
                    {d.customer.phone}
                  </a>
                </dd>
                <dt className="text-mist">ご相談内容</dt>
                <dd className="whitespace-pre-wrap">{d.consultation || "—"}</dd>
                <dt className="text-mist">同意</dt>
                <dd className="text-xs">
                  {d.consents.map((c) => (
                    <span key={c.id} className="block">
                      {c.consent_type === "privacy" ? "個人情報の取扱い" : "キャンセル規定"}（版 {c.document_version}）{formatJst(c.agreed_at)}
                    </span>
                  ))}
                </dd>
              </dl>
            ) : (
              <p className="text-sm text-mist">顧客情報は削除（匿名化）されています。</p>
            )}
          </Card>

          <Card title="通知履歴">
            {d.notices.length === 0 ? (
              <p className="text-sm text-mist">ありません。</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {d.notices.map((n) => (
                  <li key={n.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      {kindLabel(n.kind)} <span className="text-xs text-mist">{n.recipient === "admin" ? "管理者" : "お客様"}・{n.channel}・{n.attempt}回目</span>
                    </span>
                    <span className={`text-xs ${n.status === "sent" ? "text-ok" : n.status === "failed" ? "text-ng" : "text-warn"}`}>
                      {n.status} {formatJst(n.created_at)}
                      {n.error && <span className="block text-mist">{n.error}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="監査ログ">
            <ul className="divide-y divide-line text-xs">
              {d.audit.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                  <span>
                    {a.action} {a.from_status && a.to_status && a.from_status !== a.to_status ? `（${a.from_status} → ${a.to_status}）` : ""}
                  </span>
                  <span className="text-mist">
                    {a.actor_type}
                    {a.actor_id ? `:${a.actor_id}` : ""} ・ {formatJst(a.at)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="操作">
            <div className="space-y-5">
              {r.status === "pending_line" && hasPermission(admin, "operate", r.controller) && (
                <div className="space-y-2 border-b border-line pb-5">
                  <p className="text-xs text-ink-soft">
                    {lineMessagingConfigured()
                      ? "LINEの自動照合ができなかった場合（予約番号を書き換えて送られた等）に使います。"
                      : "LINE Messaging API が未設定のため、公式LINEのトークで受信を確認したら手動で照合してください。"}
                    公式LINEのトークに予約番号「{r.code}」のメッセージが届いていることを確認してください。
                  </p>
                  <ActionForm action={manualMatchAction} hidden={hidden} label="LINE受信を手動で照合する" confirmTitle="LINE受信を手動で照合しますか？" confirmMessage={`公式LINEで ${r.code} のメッセージを受信したことを確認済みとして記録します。`}>
                    <input name="note" required placeholder="照合メモ（例：トーク名・受信時刻）" className={input} />
                  </ActionForm>
                </div>
              )}
              {can("confirmed") && (
                <ActionForm
                  action={confirmAction}
                  hidden={hidden}
                  tone="primary"
                  label="承認して予約を確定する"
                  confirmTitle="この予約を確定しますか？"
                  confirmMessage={`${summary}\n\n確定すると、お客様に予約確定のLINEを送信します。`}
                />
              )}
              {can("change_proposed") && (
                <ActionForm action={proposeAction} hidden={hidden} label="日時の変更を提案する" confirmTitle="この日時を提案しますか？" confirmMessage="提案中は新しい日時の枠を仮押さえし、元の枠は解放します。お客様にLINEで提案を送ります。">
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" name="date" required defaultValue={jstDateKey(r.start_at)} className={input} />
                    <input type="time" name="time" required step={300} defaultValue={jstTime(r.start_at)} className={input} />
                  </div>
                </ActionForm>
              )}
              {can("completed") && new Date(r.start_at).getTime() <= Date.now() && <ActionForm action={completeAction} hidden={hidden} label="施術完了にする" />}
              {can("cancelled") && (
                <ActionForm action={cancelAction} hidden={hidden} tone="danger" label="キャンセルする" confirmTitle="この予約をキャンセルしますか？" confirmMessage={summary}>
                  <input name="reason" placeholder="理由（任意・お客様への通知に記載）" className={input} />
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" name="notify" defaultChecked className="accent-ink" /> お客様にLINEで通知する
                  </label>
                </ActionForm>
              )}
              {!can("confirmed") && !can("cancelled") && r.status !== "pending_line" && <p className="text-xs text-mist">この予約に対して行える操作はありません。</p>}
            </div>
          </Card>

          {noticeText && hasPermission(admin, "operate", r.controller) && (
            <Card title="お客様への通知">
              {lastNotice && (
                <p className={`mb-2 text-xs ${lastNotice.status === "sent" ? "text-ok" : lastNotice.status === "failed" ? "text-ng" : "text-warn"}`}>
                  {lastNotice.status === "sent" && `送信済み（${formatJst(lastNotice.created_at)}）`}
                  {lastNotice.status === "failed" && `LINEの送信に失敗しました（予約の状態は「${STATUS_LABEL[r.status]}」のままです）。原因を確認して再送してください：${lastNotice.error ?? ""}`}
                  {lastNotice.status === "manual_required" && `自動送信できません：${lastNotice.error ?? ""}。下の文面を公式LINEのトークから送ってください。`}
                </p>
              )}
              <textarea readOnly value={noticeText} rows={10} className="w-full border border-line bg-stone p-2 text-xs" />
              <div className="mt-3 space-y-2">
                {d.lineLinked && lineMessagingConfigured() && <ActionForm action={resendAction} hidden={{ id: r.id }} label="LINEで再送する" confirmMessage="同じ内容をもう一度送信します。" />}
                {r.notice_status !== "sent" && <ActionForm action={markManualAction} hidden={{ id: r.id }} label="手動送信済みとして記録" confirmMessage="公式LINEのトークから送信したことを記録します。" />}
              </div>
            </Card>
          )}

          {d.customer && !d.customer.anonymized && hasPermission(admin, "settings", r.controller) && (
            <Card title="個人情報の削除">
              <p className="mb-2 text-xs text-ink-soft">ご本人から削除の依頼があった場合に使います。氏名・電話番号・相談内容・LINE連携を削除し、元に戻せません。</p>
              <ActionForm action={deleteCustomerAction} hidden={{ customer_id: d.customer.id }} tone="danger" label="この顧客の情報を削除" confirmTitle="顧客情報を削除しますか？" confirmMessage="この操作は取り消せません。進行中の予約がある場合は削除できません。" />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
