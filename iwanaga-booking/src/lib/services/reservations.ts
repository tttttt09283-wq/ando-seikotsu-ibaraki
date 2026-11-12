/**
 * 予約の業務ロジック（サーバー専用）。
 *   - フォーム送信 → 仮予約（pending_line）。ここでは決して確定しない
 *   - LINE で予約番号＋確認コードを受信 → pending_review（LINE受付確認済み）
 *   - 管理者の承認 → confirmed → 確定メッセージ送信（失敗しても予約は確定のまま、再送可）
 */
import "server-only";
import { config, lineMessagingConfigured } from "../config";
import { decrypt, encrypt, generateReservationCode, generateToken, generateVerifyCode, lookupHash, newId, safeEqualHex } from "../crypto";
import { availableSlots, checkSlot, SLOT_REASON_LABEL, type SlotContext } from "../domain/availability";
import { locationGate, publicServices, serviceGate, toPublicLocation } from "../domain/gate";
import { buildLinePrefill, lineReceivedReply, parseLineMessage } from "../domain/messages";
import { canTransition, isProvisional, STATUS_LABEL } from "../domain/status";
import type { Location, Reservation, ReservationStatus } from "../domain/types";
import { CANCEL_POLICY_VERSION, PRIVACY_VERSION, validateReservationInput } from "../domain/validation";
import { replyText } from "../line/client";
import type { AdminContext } from "../auth/permissions";
import { assertPermission } from "../auth/permissions";
import type { Repo } from "../repo/types";
import { addDaysToKey, addMinutes, formatRange, jstDateKey, jstDateTime } from "../time";
import { notifyAdmin, sendCustomerMessage, type SendResult } from "./notifications";

export const PRACTITIONER = "iwanaga";
const MAX_LINE_MATCH_FAILURES = 5;

// ---------------------------------------------------------------------
// 公開側
// ---------------------------------------------------------------------

export async function getPublicCatalog(repo: Repo) {
  const [locations, services] = await Promise.all([repo.listLocations(), repo.listServices()]);
  return locations
    .filter((l) => l.is_active)
    .map((l) => ({
      ...toPublicLocation(l),
      services: publicServices(
        services.filter((s) => s.location_id === l.id),
        l,
      ).map((s) => ({ id: s.id, name: s.name, description: s.description, duration_minutes: s.duration_minutes, price_tax_included: s.price_tax_included as number })),
    }));
}
export type PublicCatalog = Awaited<ReturnType<typeof getPublicCatalog>>;

async function slotContext(repo: Repo, loc: Location, date: string, now: Date): Promise<SlotContext> {
  const from = jstDateTime(addDaysToKey(date, -1), "00:00").toISOString();
  const to = jstDateTime(addDaysToKey(date, 2), "00:00").toISOString();
  const [locations, rules, blocks, reservations] = await Promise.all([
    repo.listLocations(),
    repo.listRules(loc.id),
    repo.listBlocks(from, to),
    repo.listActiveReservations(PRACTITIONER, from, to),
  ]);
  return { location: loc, locations: new Map(locations.map((l) => [l.id, l])), rules, blocks, reservations, now };
}

export async function getAvailability(repo: Repo, locationId: string, serviceId: string, date: string, now: Date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false as const, error: "日付が正しくありません" };
  const loc = await repo.getLocation(locationId);
  if (!loc) return { ok: false as const, error: "施術場所が見つかりません" };
  const gate = locationGate(loc);
  if (!gate.ok) return { ok: false as const, error: gate.reason };
  const svc = await repo.getService(serviceId);
  if (!svc || !serviceGate(svc, loc).ok) return { ok: false as const, error: "メニューが見つかりません" };
  const ctx = await slotContext(repo, loc, date, now);
  return { ok: true as const, slots: availableSlots(ctx, date, svc.duration_minutes) };
}

/** 空きのある日付（カレンダー表示用） */
export async function getAvailableDates(repo: Repo, locationId: string, serviceId: string, now: Date, days = 31) {
  const loc = await repo.getLocation(locationId);
  if (!loc || !locationGate(loc).ok) return [];
  const svc = await repo.getService(serviceId);
  if (!svc || !serviceGate(svc, loc).ok) return [];
  const today = jstDateKey(now);
  const span = Math.min(days, loc.max_advance_days + 1);
  const from = jstDateTime(today, "00:00").toISOString();
  const to = jstDateTime(addDaysToKey(today, span + 1), "00:00").toISOString();
  const [locations, rules, blocks, reservations] = await Promise.all([
    repo.listLocations(),
    repo.listRules(loc.id),
    repo.listBlocks(from, to),
    repo.listActiveReservations(PRACTITIONER, from, to),
  ]);
  const ctx: SlotContext = { location: loc, locations: new Map(locations.map((l) => [l.id, l])), rules, blocks, reservations, now };
  const out: string[] = [];
  for (let i = 0; i <= span; i++) {
    const d = addDaysToKey(today, i);
    if (availableSlots(ctx, d, svc.duration_minutes).length > 0) out.push(d);
  }
  return out;
}

export interface CreateContext {
  now: Date;
  verifyLiff?: (idToken: string) => Promise<string | null>;
}

export type CreateResult =
  | {
      ok: true;
      code: string;
      viewToken: string;
      verifyCode: string;
      linePrefill: string;
      lineUrl: string | null;
      lineAutoConfirm: boolean;
      holdExpiresAt: string;
    }
  | { ok: false; errors?: Record<string, string>; message: string };

const HOLD_FAIL_MESSAGE: Record<string, string> = {
  no_location: "施術場所が見つかりません。",
  location_closed: "現在この施術場所の予約は受け付けていません。",
  service_unavailable: "このメニューは現在受け付けていません。",
  blocked: SLOT_REASON_LABEL.blocked,
  conflict: "申し訳ありません。この時間は直前に埋まりました。別の時間をお選びください。",
  daily_limit: SLOT_REASON_LABEL.daily_limit,
  duplicate: "送信が重複しました。もう一度お試しください。",
};

export function lineChatUrl(prefill: string | null): string | null {
  const id = config.lineBasicId;
  if (!id) return null;
  const basic = id.startsWith("@") ? id : `@${id}`;
  return prefill ? `https://line.me/R/oaMessage/${encodeURIComponent(basic)}/?${encodeURIComponent(prefill)}` : `https://line.me/R/ti/p/${encodeURIComponent(basic)}`;
}

/** フォーム送信 → 仮予約の作成（予約IDはサーバー側で生成） */
export async function createReservation(repo: Repo, raw: unknown, ctx: CreateContext): Promise<CreateResult> {
  const v = validateReservationInput(raw);
  if (!v.ok) return { ok: false, errors: v.errors, message: "入力内容をご確認ください。" };
  const input = v.data;

  const loc = await repo.getLocation(input.location_id);
  if (!loc) return { ok: false, message: HOLD_FAIL_MESSAGE.no_location };
  const gate = locationGate(loc);
  if (!gate.ok) return { ok: false, message: gate.reason };
  const svc = await repo.getService(input.service_id);
  if (!svc) return { ok: false, message: HOLD_FAIL_MESSAGE.service_unavailable };
  const sg = serviceGate(svc, loc);
  if (!sg.ok) return { ok: false, message: sg.reason };

  let start: Date;
  try {
    start = jstDateTime(input.date, input.time);
  } catch {
    return { ok: false, errors: { date: "日時が正しくありません" }, message: "入力内容をご確認ください。" };
  }
  const end = addMinutes(start, svc.duration_minutes);
  const sc = await slotContext(repo, loc, input.date, ctx.now);
  const reject = checkSlot(sc, start, svc.duration_minutes);
  if (reject) return { ok: false, errors: { time: SLOT_REASON_LABEL[reject] }, message: SLOT_REASON_LABEL[reject] };

  // LIFF で本人確認できた場合のみ LINE ユーザーを事前に紐づける（クライアントの userId は信用しない）
  let liffUserId: string | null = null;
  if (input.liff_id_token && ctx.verifyLiff) liffUserId = await ctx.verifyLiff(input.liff_id_token);

  const holdExpiresAt = addMinutes(ctx.now, config.lineHoldMinutes);
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateReservationCode();
    const verifyCode = generateVerifyCode();
    const viewToken = generateToken();
    const res = await repo.createHold(
      {
        reservation: {
          id: newId(),
          code,
          location_id: loc.id,
          service_id: svc.id,
          practitioner_key: PRACTITIONER,
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          block_start_at: start.toISOString(),
          block_end_at: addMinutes(end, loc.buffer_minutes).toISOString(),
          service_snapshot: { name: svc.name, duration_minutes: svc.duration_minutes, price_tax_included: svc.price_tax_included as number },
          consultation_enc: input.consultation ? encrypt(input.consultation) : null,
          source: input.source ?? null,
          line_verify_hash: lookupHash("verify", `${code}:${verifyCode}`),
          view_token_hash: lookupHash("view", `${code}:${viewToken}`),
          liff_user_hash: liffUserId ? lookupHash("line", liffUserId) : null,
          hold_expires_at: holdExpiresAt.toISOString(),
        },
        customer: { name_enc: encrypt(input.name), phone_enc: encrypt(input.phone), phone_hash: lookupHash("phone", input.phone) },
        consents: [
          { consent_type: "privacy", document_version: PRIVACY_VERSION },
          { consent_type: "cancel_policy", document_version: CANCEL_POLICY_VERSION },
        ],
        liffLine: liffUserId ? { line_user_hash: lookupHash("line", liffUserId), line_user_enc: encrypt(liffUserId) } : null,
      },
      ctx.now,
    );
    if (!res.ok) {
      if (res.reason === "duplicate") continue;
      return { ok: false, errors: res.reason === "conflict" ? { time: HOLD_FAIL_MESSAGE.conflict } : undefined, message: HOLD_FAIL_MESSAGE[res.reason] ?? "受付できませんでした。" };
    }
    const r = (await repo.getReservation(res.reservationId))!;
    await notifyAdmin(repo, r, loc, "new_hold").catch((e) => console.error("notifyAdmin failed", e));
    const prefill = buildLinePrefill({ code, verifyCode, locationName: loc.name, when: formatRange(r.start_at, r.end_at), menu: `${svc.name}（${svc.duration_minutes}分）` });
    return {
      ok: true,
      code,
      viewToken,
      verifyCode,
      linePrefill: prefill,
      lineUrl: lineChatUrl(prefill),
      lineAutoConfirm: lineMessagingConfigured(),
      holdExpiresAt: holdExpiresAt.toISOString(),
    };
  }
  return { ok: false, message: HOLD_FAIL_MESSAGE.duplicate };
}

async function reservationForCustomer(repo: Repo, code: string, token: string): Promise<Reservation | null> {
  if (!/^IW-[2-9A-HJ-NP-Z]{6}$/.test(code) || !token || token.length > 100) return null;
  const r = await repo.getReservationByCode(code);
  if (!r) return null;
  return safeEqualHex(r.view_token_hash, lookupHash("view", `${code}:${token}`)) ? r : null;
}

/** 利用者向けの予約状況（氏名・電話番号などは返さない） */
export async function getCustomerView(repo: Repo, code: string, token: string, now: Date) {
  await repo.expireStaleHolds(now);
  const r = await reservationForCustomer(repo, code, token);
  if (!r) return null;
  const loc = await repo.getLocation(r.location_id);
  return {
    code: r.code,
    status: r.status,
    statusLabel: STATUS_LABEL[r.status],
    provisional: isProvisional(r.status),
    lineReceived: r.line_received_at !== null,
    lineAutoConfirm: lineMessagingConfigured(),
    locationName: loc?.name ?? "",
    when: formatRange(r.start_at, r.end_at),
    previousWhen: r.previous_start_at && r.previous_end_at ? formatRange(r.previous_start_at, r.previous_end_at) : null,
    menu: r.service_snapshot.name,
    price: r.service_snapshot.price_tax_included,
    duration: r.service_snapshot.duration_minutes,
    holdExpiresAt: r.hold_expires_at,
    canCancel: r.status === "pending_line" || r.status === "pending_review",
    lineChatUrl: lineChatUrl(null),
  };
}

export async function cancelByCustomer(repo: Repo, code: string, token: string, now: Date) {
  const r = await reservationForCustomer(repo, code, token);
  if (!r || !canTransition(r.status, "cancelled", "customer")) return { ok: false as const, message: "この予約は取り消せません。" };
  const next = await repo.transition(
    r.id,
    r.status,
    r.version,
    { status: "cancelled", cancelled_at: now.toISOString(), cancel_reason: "お客様による取り消し", hold_expires_at: null },
    { actor_type: "customer", actor_id: null, action: "cancelled_by_customer" },
    now,
  );
  return next ? { ok: true as const } : { ok: false as const, message: "状態が変わったため取り消せませんでした。" };
}

// ---------------------------------------------------------------------
// LINE Webhook
// ---------------------------------------------------------------------

export type LineMatchResult = "matched" | "no_code" | "not_found" | "bad_code" | "not_pending" | "expired" | "liff_mismatch" | "locked";

export async function handleLineTextMessage(
  repo: Repo,
  ev: { lineUserId: string; text: string; replyToken?: string },
  now: Date,
): Promise<LineMatchResult> {
  const parsed = parseLineMessage(ev.text);
  if (!parsed) return "no_code";
  await repo.expireStaleHolds(now);
  const r = await repo.getReservationByCode(parsed.code);
  if (!r) return "not_found";

  const failures = (await repo.listAudit({ reservationId: r.id, limit: 50 })).filter((a) => a.action === "line_match_rejected").length;
  if (failures >= MAX_LINE_MATCH_FAILURES) return "locked";

  const reject = async (reason: string) => {
    await repo.addAudit({
      actor_type: "line_webhook",
      actor_id: null,
      controller: r.controller,
      location_id: r.location_id,
      reservation_id: r.id,
      action: "line_match_rejected",
      from_status: r.status,
      to_status: r.status,
      detail: { reason },
    });
  };

  if (!safeEqualHex(r.line_verify_hash, lookupHash("verify", `${parsed.code}:${parsed.verifyCode}`))) {
    await reject("bad_verify_code");
    return "bad_code";
  }
  const userHash = lookupHash("line", ev.lineUserId);
  // LIFF で本人確認済みの予約は、同じ LINE ユーザーからの送信だけを受け付ける（送信元照合）
  if (r.liff_user_hash && !safeEqualHex(r.liff_user_hash, userHash)) {
    await reject("liff_user_mismatch");
    return "liff_mismatch";
  }
  if (r.status === "expired") {
    if (ev.replyToken) await replyText(ev.replyToken, `予約番号 ${r.code} の仮予約は受付期限を過ぎたため無効になりました。お手数ですが、もう一度予約フォームからお申し込みください。`);
    return "expired";
  }
  if (r.status !== "pending_line") return "not_pending";

  const reviewUntil = new Date(Math.min(addMinutes(now, config.reviewHoldHours * 60).getTime(), new Date(r.start_at).getTime()));
  const next = await repo.transition(
    r.id,
    "pending_line",
    r.version,
    { status: "pending_review", line_received_at: now.toISOString(), line_match_method: "webhook", hold_expires_at: reviewUntil.toISOString() },
    { actor_type: "line_webhook", actor_id: null, action: "line_received", detail: { method: "webhook" } },
    now,
  );
  if (!next) return "not_pending";
  await repo.linkLineAccount({
    controller: r.controller,
    location_id: r.location_id,
    customer_id: r.customer_id,
    line_user_hash: userHash,
    line_user_enc: encrypt(ev.lineUserId),
    linked_via: r.liff_user_hash ? "liff" : "webhook",
  });
  if (ev.replyToken) {
    const rep = await replyText(ev.replyToken, lineReceivedReply(r.code));
    await repo.addNotification({
      reservation_id: r.id,
      controller: r.controller,
      location_id: r.location_id,
      channel: "line_reply",
      recipient: "customer",
      kind: "line_received",
      status: rep.ok ? "sent" : "failed",
      summary: `仮予約受付の返信 ${r.code}`,
      error: rep.error ?? null,
      attempt: 1,
    });
  }
  const loc = await repo.getLocation(r.location_id);
  if (loc) await notifyAdmin(repo, next, loc, "line_received").catch((e) => console.error(e));
  return "matched";
}

// ---------------------------------------------------------------------
// 管理者操作（すべてサーバー側で権限を確認し、楽観ロックで二重操作を防ぐ）
// ---------------------------------------------------------------------

export class OperationError extends Error {}

async function loadForAdmin(repo: Repo, admin: AdminContext | null, id: string, perm: "view" | "operate" = "operate") {
  const r = await repo.getReservation(id);
  if (!r) throw new OperationError("予約が見つかりません");
  assertPermission(admin, perm, r.controller);
  return r;
}

function ensure(r: Reservation, expectedVersion: number, to: ReservationStatus) {
  if (r.version !== expectedVersion) throw new OperationError("他の操作で内容が更新されています。画面を再読み込みしてください。");
  if (!canTransition(r.status, to, "admin")) throw new OperationError(`「${STATUS_LABEL[r.status]}」の予約は、この操作ができません。`);
}

const STALE = "他の操作で内容が更新されています（二重操作を防止しました）。画面を再読み込みしてください。";

/** 承認（確定）。LINE受付確認済み（pending_review）か変更提案中のみ。確定後にLINEで確定通知 */
export async function confirmReservation(repo: Repo, admin: AdminContext | null, id: string, expectedVersion: number, now: Date) {
  const r = await loadForAdmin(repo, admin, id);
  ensure(r, expectedVersion, "confirmed");
  const next = await repo.transition(
    r.id,
    r.status,
    r.version,
    { status: "confirmed", confirmed_at: now.toISOString(), confirmed_by: admin!.email, hold_expires_at: null, notice_status: "none" },
    { actor_type: "admin", actor_id: admin!.email, action: "confirmed" },
    now,
  );
  if (!next) throw new OperationError(STALE);
  const notice = await sendCustomerMessage(repo, next, "confirmed");
  return { reservation: next, notice };
}

export async function proposeChange(repo: Repo, admin: AdminContext | null, id: string, expectedVersion: number, date: string, time: string, now: Date) {
  const r = await loadForAdmin(repo, admin, id);
  ensure(r, expectedVersion, "change_proposed");
  const loc = await repo.getLocation(r.location_id);
  if (!loc) throw new OperationError("施術場所が見つかりません");
  let start: Date;
  try {
    start = jstDateTime(date, time);
  } catch {
    throw new OperationError("日時が正しくありません");
  }
  if (start.getTime() <= now.getTime()) throw new OperationError("過去の日時は提案できません");
  const end = addMinutes(start, r.service_snapshot.duration_minutes);
  const hold = new Date(Math.min(addMinutes(now, config.proposalHoldHours * 60).getTime(), start.getTime()));
  const res = await repo.proposeChange(
    r.id,
    r.status,
    r.version,
    { start_at: start.toISOString(), end_at: end.toISOString(), block_end_at: addMinutes(end, loc.buffer_minutes).toISOString(), hold_expires_at: hold.toISOString() },
    { actor_type: "admin", actor_id: admin!.email, action: "change_proposed" },
    now,
  );
  if (!res.ok) {
    if (res.reason === "stale") throw new OperationError(STALE);
    throw new OperationError(res.reason === "blocked" ? "その時間はブロックされています" : "その時間は他の予約（移動時間を含む）と重なります");
  }
  const next = (await repo.getReservation(r.id))!;
  const notice = await sendCustomerMessage(repo, next, "change_proposed");
  return { reservation: next, notice };
}

export async function cancelReservation(repo: Repo, admin: AdminContext | null, id: string, expectedVersion: number, reason: string, notify: boolean, now: Date) {
  const r = await loadForAdmin(repo, admin, id);
  ensure(r, expectedVersion, "cancelled");
  const next = await repo.transition(
    r.id,
    r.status,
    r.version,
    { status: "cancelled", cancelled_at: now.toISOString(), cancel_reason: reason.slice(0, 200) || null, hold_expires_at: null },
    { actor_type: "admin", actor_id: admin!.email, action: "cancelled", detail: { notify } },
    now,
  );
  if (!next) throw new OperationError(STALE);
  let notice: SendResult = { status: "skipped" };
  if (notify) notice = await sendCustomerMessage(repo, next, "cancelled");
  return { reservation: next, notice };
}

export async function completeReservation(repo: Repo, admin: AdminContext | null, id: string, expectedVersion: number, now: Date) {
  const r = await loadForAdmin(repo, admin, id);
  ensure(r, expectedVersion, "completed");
  if (new Date(r.start_at).getTime() > now.getTime()) throw new OperationError("施術開始前の予約は完了にできません");
  const next = await repo.transition(r.id, r.status, r.version, { status: "completed", completed_at: now.toISOString() }, { actor_type: "admin", actor_id: admin!.email, action: "completed" }, now);
  if (!next) throw new OperationError(STALE);
  return { reservation: next };
}

/**
 * LINE受信の手動照合（Messaging API 未設定時や、利用者が予約番号を書き換えて送った場合など）。
 * 管理者が公式LINEのトークで受信を確認したことを記録する。LINEユーザーの紐づけは行わない。
 */
export async function manualLineMatch(repo: Repo, admin: AdminContext | null, id: string, expectedVersion: number, note: string, now: Date) {
  const r = await loadForAdmin(repo, admin, id);
  if (r.version !== expectedVersion) throw new OperationError(STALE);
  if (r.status !== "pending_line") throw new OperationError("LINE送信待ちの予約だけ手動照合できます");
  if (!note.trim()) throw new OperationError("照合メモ（例：LINEのトーク名・受信時刻）を入力してください");
  const reviewUntil = new Date(Math.min(addMinutes(now, config.reviewHoldHours * 60).getTime(), new Date(r.start_at).getTime()));
  const next = await repo.transition(
    r.id,
    "pending_line",
    r.version,
    { status: "pending_review", line_received_at: now.toISOString(), line_match_method: "manual", hold_expires_at: reviewUntil.toISOString() },
    { actor_type: "admin", actor_id: admin!.email, action: "line_received_manual", detail: { note: note.slice(0, 200) } },
    now,
  );
  if (!next) throw new OperationError(STALE);
  return { reservation: next };
}

/** 通知の再送（予約の状態と一致する通知だけ送れる） */
export async function resendNotice(repo: Repo, admin: AdminContext | null, id: string) {
  const r = await loadForAdmin(repo, admin, id);
  const kind = r.status === "confirmed" ? "confirmed" : r.status === "change_proposed" ? "change_proposed" : r.status === "cancelled" ? "cancelled" : null;
  if (!kind) throw new OperationError("再送できる通知がありません");
  const prev = await repo.listNotifications({ reservationId: r.id, recipient: "customer" });
  const attempt = prev.filter((n) => n.kind === kind).length + 1;
  await repo.addAudit({ actor_type: "admin", actor_id: admin!.email, controller: r.controller, location_id: r.location_id, reservation_id: r.id, action: "notice_resend", from_status: r.status, to_status: r.status, detail: { kind, attempt } });
  return sendCustomerMessage(repo, r, kind, attempt);
}

/** 公式LINEのトークから手動で送ったことを記録する */
export async function markNoticeSentManually(repo: Repo, admin: AdminContext | null, id: string) {
  const r = await loadForAdmin(repo, admin, id);
  const kind = r.status === "confirmed" ? "confirmed" : r.status === "change_proposed" ? "change_proposed" : r.status === "cancelled" ? "cancelled" : null;
  if (!kind) throw new OperationError("記録できる通知がありません");
  await repo.addNotification({ reservation_id: r.id, controller: r.controller, location_id: r.location_id, channel: "manual", recipient: "customer", kind, status: "sent", summary: `手動送信済み ${r.code}`, error: null, attempt: 1 });
  await repo.setNoticeStatus(r.id, "sent");
  await repo.addAudit({ actor_type: "admin", actor_id: admin!.email, controller: r.controller, location_id: r.location_id, reservation_id: r.id, action: "notice_marked_manual", from_status: r.status, to_status: r.status, detail: { kind } });
}

/** 管理画面の予約詳細（個人情報を復号して返す。閲覧を監査ログに残す） */
export async function getAdminReservationDetail(repo: Repo, admin: AdminContext | null, id: string) {
  const r = await loadForAdmin(repo, admin, id, "view");
  const [customer, loc, line, consents, notices, audit] = await Promise.all([
    repo.getCustomer(r.customer_id),
    repo.getLocation(r.location_id),
    repo.getLineAccountByCustomer(r.customer_id),
    repo.listConsents(r.id),
    repo.listNotifications({ reservationId: r.id }),
    repo.listAudit({ reservationId: r.id }),
  ]);
  await repo.addAudit({ actor_type: "admin", actor_id: admin!.email, controller: r.controller, location_id: r.location_id, reservation_id: r.id, action: "reservation_viewed", from_status: null, to_status: null, detail: {} });
  return {
    reservation: r,
    location: loc!,
    customer: customer
      ? { name: decrypt(customer.name_enc), phone: decrypt(customer.phone_enc), anonymized: customer.anonymized_at !== null, id: customer.id }
      : null,
    consultation: r.consultation_enc ? decrypt(r.consultation_enc) : "",
    lineLinked: line !== null,
    consents,
    notices,
    audit,
  };
}

/** 期限切れホールドの自動解放（cron・各リクエスト時） */
export async function expireHolds(repo: Repo, now: Date) {
  const expired = await repo.expireStaleHolds(now);
  for (const r of expired) {
    const loc = await repo.getLocation(r.location_id);
    if (loc) await notifyAdmin(repo, r, loc, "expired").catch(() => undefined);
  }
  return expired.length;
}

export async function runRetention(repo: Repo, now: Date) {
  const consultBefore = addMinutes(now, -config.consultationRetentionDays * 24 * 60);
  const customerBefore = addMinutes(now, -config.customerRetentionDays * 24 * 60);
  const res = await repo.runRetention(now, consultBefore, customerBefore);
  await repo.addAudit({ actor_type: "system", actor_id: "retention", controller: null, location_id: null, reservation_id: null, action: "retention_run", from_status: null, to_status: null, detail: res });
  return res;
}

/** 管理者による顧客情報の削除（本人からの削除依頼など） */
export async function deleteCustomerData(repo: Repo, admin: AdminContext | null, customerId: string, now: Date) {
  const c = await repo.getCustomer(customerId);
  if (!c) throw new OperationError("顧客が見つかりません");
  assertPermission(admin, "settings", c.controller);
  const active = await repo.searchReservations({ customerIds: [c.id], statuses: ["pending_line", "pending_review", "confirmed", "change_proposed"] });
  if (active.length > 0) throw new OperationError("進行中の予約があるため削除できません。先にキャンセルしてください。");
  await repo.anonymizeCustomer(c.id, now);
  await repo.addAudit({ actor_type: "admin", actor_id: admin!.email, controller: c.controller, location_id: c.location_id, reservation_id: null, action: "customer_deleted_by_admin", from_status: null, to_status: null, detail: { customer_id: c.id } });
}

export { decrypt };
