/**
 * 受付の可否（サーバー側で必ず判定する）。
 * - 自宅院：開業許可・準備完了（opening_ready）まで受け付けない
 * - 勤務先：会社の正式承認（company_approved）まで受け付けない（個人LINEで勤務先の予約情報を扱わない）
 * - メニュー：公開承認（勤務先は会社承認済みの料金）されたものだけ
 */
import type { Location, Service } from "./types";

export type GateResult = { ok: true } | { ok: false; reason: string };

export function locationGate(loc: Location): GateResult {
  if (!loc.is_active) return { ok: false, reason: "現在この施術場所の予約は受け付けていません。" };
  if (loc.kind === "home" && !loc.opening_ready) return { ok: false, reason: "開業準備中のため、予約受付はまだ開始していません。" };
  if (loc.kind === "workplace" && !loc.company_approved)
    return { ok: false, reason: "この施術場所の予約受付は準備中です。（受付開始までお待ちください）" };
  if (!loc.booking_enabled) return { ok: false, reason: "現在この施術場所の予約は受け付けていません。" };
  return { ok: true };
}

export function serviceGate(svc: Service, loc: Location): GateResult {
  if (svc.location_id !== loc.id) return { ok: false, reason: "メニューと施術場所が一致しません。" };
  if (!svc.is_published || svc.price_status !== "approved" || svc.price_tax_included === null)
    return { ok: false, reason: "このメニューは現在受け付けていません。" };
  return { ok: true };
}

/** 公開してよいメニュー（料金未承認・非公開のものは返さない） */
export function publicServices(services: Service[], loc: Location): Service[] {
  if (!locationGate(loc).ok) return [];
  return services.filter((s) => serviceGate(s, loc).ok).sort((a, b) => a.sort_order - b.sort_order);
}

/** 公開API向けの拠点情報（詳細住所・承認メモなどを除く） */
export function toPublicLocation(loc: Location) {
  const gate = locationGate(loc);
  return {
    id: loc.id,
    kind: loc.kind,
    name: loc.name,
    short_name: loc.short_name,
    public_area: loc.public_area,
    accepting: gate.ok,
    closed_reason: gate.ok ? null : gate.reason,
    controller_name: loc.controller_name,
    privacy_purpose: loc.privacy_purpose,
    privacy_access: loc.privacy_access,
    cancel_policy: loc.cancel_policy,
    precautions: loc.precautions,
    booking_deadline_hours: loc.booking_deadline_hours,
    max_advance_days: loc.max_advance_days,
  };
}
export type PublicLocation = ReturnType<typeof toPublicLocation>;
