/**
 * 通知。予約ステータスと通知ステータスは分離する（送信に失敗しても予約ステータスは変えず、再送できる）。
 *
 * 管理者向け：管理画面通知（常に）＋ LINE push（ADMIN_LINE_NOTIFY=true のとき）＋ メール（Resend 設定時）
 * 利用者向け：LINE push（LINEアカウントが紐づいているとき）。紐づいていなければ「手動送信が必要」として記録
 */
import "server-only";
import { createHash } from "node:crypto";
import { config, lineMessagingConfigured } from "../config";
import { decrypt } from "../crypto";
import { adminNewHoldText, cancellationMessage, changeProposalMessage, confirmationMessage } from "../domain/messages";
import type { Location, NotificationKind, Reservation } from "../domain/types";
import { pushText } from "../line/client";
import type { Repo } from "../repo/types";

type Fetcher = typeof fetch;
let mailFetcher: Fetcher = (...a) => fetch(...a);
export function setMailFetcher(f: Fetcher | null) {
  mailFetcher = f ?? ((...a) => fetch(...a));
}

/** X-Line-Retry-Key 用の UUID（同じ通知の再送で二重送信されないよう決定的に作る） */
export function retryKeyFor(parts: string): string {
  const h = createHash("sha256").update(parts).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function sendMail(subject: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!config.resendApiKey || !config.mailFrom || config.adminNotifyEmails.length === 0) return { ok: false, error: "メール未設定" };
  try {
    const res = await mailFetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.mailFrom, to: config.adminNotifyEmails, subject, text }),
    });
    if (!res.ok) return { ok: false, error: `mail ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** 管理者への通知（新規仮予約・LINE受付確認）。個人情報（電話・相談内容）は含めない */
export async function notifyAdmin(repo: Repo, r: Reservation, loc: Location, kind: "new_hold" | "line_received" | "expired") {
  const text = kind === "expired" ? `【仮予約の期限切れ】予約番号：${r.code}（${loc.short_name}）` : adminNewHoldText(r, loc, kind);
  const base = { reservation_id: r.id, controller: r.controller, location_id: r.location_id, recipient: "admin" as const, kind, attempt: 1 };
  await repo.addNotification({ ...base, channel: "admin_panel", status: "sent", summary: text.split("\n")[0] + ` ${r.code}`, error: null });

  if (kind === "expired") return;
  if (config.adminLineNotify && lineMessagingConfigured() && config.adminLineUserIds.length > 0) {
    for (const to of config.adminLineUserIds) {
      const res = await pushText(to, text, retryKeyFor(`admin:${r.id}:${kind}:${to}`));
      await repo.addNotification({ ...base, channel: "line_push", status: res.ok ? "sent" : "failed", summary: `管理者LINE通知 ${r.code}`, error: res.error ?? null });
    }
  }
  if (config.resendApiKey) {
    const m = await sendMail(text.split("\n")[0].replace(/[【】]/g, ""), text);
    await repo.addNotification({ ...base, channel: "email", status: m.ok ? "sent" : "failed", summary: `管理者メール通知 ${r.code}`, error: m.error ?? null });
  }
}

export type CustomerMessageKind = Extract<NotificationKind, "confirmed" | "change_proposed" | "cancelled">;

/** 利用者へ送る文面。kind と予約ステータスが一致しないときは作らない（承認前に確定通知を出さない） */
export function customerMessageText(r: Reservation, loc: Location, kind: CustomerMessageKind): string | null {
  if (kind === "confirmed") return r.status === "confirmed" && r.confirmed_at ? confirmationMessage(r, loc) : null;
  if (kind === "change_proposed") return r.status === "change_proposed" ? changeProposalMessage(r, loc) : null;
  if (kind === "cancelled") return r.status === "cancelled" ? cancellationMessage(r, loc, r.cancel_reason) : null;
  return null;
}

export interface SendResult {
  status: "sent" | "failed" | "manual_required" | "skipped";
  error?: string;
}

/** 利用者へLINEで送信し、通知履歴と予約の通知ステータスを更新する（予約ステータスは変えない） */
export async function sendCustomerMessage(repo: Repo, r: Reservation, kind: CustomerMessageKind, attempt = 1): Promise<SendResult> {
  const loc = await repo.getLocation(r.location_id);
  if (!loc) return { status: "skipped", error: "location not found" };
  const text = customerMessageText(r, loc, kind);
  if (!text) return { status: "skipped", error: "予約の状態が通知の種類と一致しません" };
  const base = { reservation_id: r.id, controller: r.controller, location_id: r.location_id, recipient: "customer" as const, kind, attempt };

  const account = await repo.getLineAccountByCustomer(r.customer_id);
  if (!account || !lineMessagingConfigured()) {
    const reason = !account ? "LINEアカウント未連携（公式LINEのトークから手動で送信してください）" : "LINE Messaging API 未設定";
    await repo.addNotification({ ...base, channel: "manual", status: "manual_required", summary: `${kindLabel(kind)} ${r.code}`, error: reason });
    await repo.setNoticeStatus(r.id, "manual_required");
    return { status: "manual_required", error: reason };
  }
  const to = decrypt(account.line_user_enc);
  const res = await pushText(to, text, retryKeyFor(`customer:${r.id}:${kind}:${r.start_at}:${r.confirmed_at ?? ""}:${r.cancelled_at ?? ""}`));
  await repo.addNotification({ ...base, channel: "line_push", status: res.ok ? "sent" : "failed", summary: `${kindLabel(kind)} ${r.code}`, error: res.error ?? null });
  await repo.setNoticeStatus(r.id, res.ok ? "sent" : "failed");
  return res.ok ? { status: "sent" } : { status: "failed", error: res.error };
}

export function kindLabel(kind: NotificationKind): string {
  return (
    {
      new_hold: "新規仮予約",
      line_received: "LINE受付確認",
      confirmed: "予約確定のご連絡",
      change_proposed: "日時変更のご提案",
      cancelled: "キャンセルのご連絡",
      expired: "期限切れ",
    } as const
  )[kind];
}
