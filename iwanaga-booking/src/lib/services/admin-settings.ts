/**
 * 管理画面の設定操作（場所別の営業時間・メニュー・料金・受付可否・ブロック）。
 * すべて権限を確認し、監査ログに残す。
 */
import "server-only";
import { assertPermission, type AdminContext } from "../auth/permissions";
import type { Location, Service } from "../domain/types";
import { findGuaranteeExpression, locationSettingsSchema, serviceInputSchema } from "../domain/validation";
import type { Repo } from "../repo/types";
import { jstDateTime } from "../time";
import { OperationError, PRACTITIONER } from "./reservations";

async function audit(repo: Repo, admin: AdminContext, loc: Pick<Location, "id" | "controller"> | null, action: string, detail: Record<string, unknown>) {
  await repo.addAudit({ actor_type: "admin", actor_id: admin.email, controller: loc?.controller ?? null, location_id: loc?.id ?? null, reservation_id: null, action, from_status: null, to_status: null, detail });
}

async function loc(repo: Repo, id: string) {
  const l = await repo.getLocation(id);
  if (!l) throw new OperationError("施術場所が見つかりません");
  return l;
}

export async function updateLocationSettings(repo: Repo, admin: AdminContext | null, locationId: string, form: Record<string, unknown>) {
  const l = await loc(repo, locationId);
  assertPermission(admin, "settings", l.controller);
  const p = locationSettingsSchema.safeParse(form);
  if (!p.success) throw new OperationError("入力値が正しくありません（数値の範囲をご確認ください）");
  await repo.updateLocation(l.id, p.data);
  await audit(repo, admin, l, "location_settings_updated", p.data);
}

const TEXT_FIELDS = ["name", "short_name", "public_area", "private_address", "controller_name", "privacy_purpose", "privacy_access", "cancel_policy", "precautions", "contact_info"] as const;

export async function updateLocationTexts(repo: Repo, admin: AdminContext | null, locationId: string, form: Record<string, unknown>) {
  const l = await loc(repo, locationId);
  assertPermission(admin, "settings", l.controller);
  const patch: Partial<Location> = {};
  for (const k of TEXT_FIELDS) {
    if (typeof form[k] !== "string") continue;
    const v = (form[k] as string).trim().slice(0, 2000);
    if (k === "private_address") patch.private_address = l.kind === "home" ? v || null : null;
    else (patch as Record<string, string>)[k] = v;
  }
  for (const k of ["name", "short_name", "controller_name", "privacy_purpose", "privacy_access"] as const) {
    if (k in patch && !(patch as Record<string, string>)[k]) throw new OperationError("名称・管理主体・利用目的・閲覧範囲は空にできません");
  }
  const bad = Object.values(patch).map((v) => (typeof v === "string" ? findGuaranteeExpression(v) : null)).find(Boolean);
  if (bad) throw new OperationError(`医療効果を保証する表現（「${bad}」）は使えません`);
  await repo.updateLocation(l.id, patch);
  // 詳細住所の値そのものは監査ログに残さない
  await audit(repo, admin, l, "location_texts_updated", { fields: Object.keys(patch) });
}

/** 自宅院：開業許可・準備完了 */
export async function setOpeningReady(repo: Repo, admin: AdminContext | null, locationId: string, ready: boolean, note: string) {
  const l = await loc(repo, locationId);
  assertPermission(admin, "approve_gates", l.controller);
  if (l.kind !== "home") throw new OperationError("自宅院のみの設定です");
  if (ready && !note.trim()) throw new OperationError("確認内容（例：開設届の提出日・保健所の確認）を記録してください");
  await repo.updateLocation(l.id, ready ? { opening_ready: true } : { opening_ready: false, booking_enabled: false });
  await audit(repo, admin, l, ready ? "opening_ready_set" : "opening_ready_unset", { note: note.slice(0, 500) });
}

/** 勤務先：会社の正式承認（個人LINE・本システムで勤務先の予約情報を扱うことの承認） */
export async function setCompanyApproval(repo: Repo, admin: AdminContext | null, locationId: string, approved: boolean, note: string, now: Date) {
  const l = await loc(repo, locationId);
  assertPermission(admin, "approve_gates", l.controller);
  if (l.kind !== "workplace") throw new OperationError("勤務先のみの設定です");
  if (approved && note.trim().length < 4) throw new OperationError("承認の記録（承認者・承認日・書面の有無など）を入力してください");
  await repo.updateLocation(
    l.id,
    approved
      ? { company_approved: true, company_approved_at: now.toISOString(), company_approval_note: note.slice(0, 500) }
      : { company_approved: false, booking_enabled: false },
  );
  await audit(repo, admin, l, approved ? "company_approved" : "company_approval_revoked", { note: note.slice(0, 500) });
}

export async function setBookingEnabled(repo: Repo, admin: AdminContext | null, locationId: string, enabled: boolean) {
  const l = await loc(repo, locationId);
  assertPermission(admin, "approve_gates", l.controller);
  if (enabled) {
    if (l.kind === "home" && !l.opening_ready) throw new OperationError("開業準備完了の記録が必要です");
    if (l.kind === "workplace" && !l.company_approved) throw new OperationError("会社の正式承認の記録が必要です");
  }
  await repo.updateLocation(l.id, { booking_enabled: enabled });
  await audit(repo, admin, l, enabled ? "booking_enabled" : "booking_disabled", {});
}

export async function addRule(repo: Repo, admin: AdminContext | null, locationId: string, form: Record<string, string>) {
  const l = await loc(repo, locationId);
  assertPermission(admin, "settings", l.controller);
  const kind = form.kind; // weekly | date_open | date_closed
  const time = (t: string | undefined) => (t && /^\d{2}:\d{2}$/.test(t) ? t : null);
  const start = time(form.start_time);
  const end = time(form.end_time);
  if (kind !== "date_closed" && (!start || !end || start >= end)) throw new OperationError("開始・終了時刻を正しく入力してください");
  if (kind === "weekly") {
    const w = Number(form.weekday);
    if (!(w >= 0 && w <= 6)) throw new OperationError("曜日を選んでください");
    await repo.insertRule({ location_id: l.id, weekday: w, specific_date: null, start_time: start, end_time: end, is_closed: false, note: null });
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date ?? "")) throw new OperationError("日付を選んでください");
    await repo.insertRule({
      location_id: l.id,
      weekday: null,
      specific_date: form.date,
      start_time: kind === "date_closed" ? null : start,
      end_time: kind === "date_closed" ? null : end,
      is_closed: kind === "date_closed",
      note: (form.note ?? "").slice(0, 100) || null,
    });
  }
  await audit(repo, admin, l, "availability_rule_added", { kind, weekday: form.weekday, date: form.date, start, end });
}

export async function deleteRule(repo: Repo, admin: AdminContext | null, locationId: string, ruleId: string) {
  const l = await loc(repo, locationId);
  assertPermission(admin, "settings", l.controller);
  const rule = (await repo.listRules(l.id)).find((r) => r.id === ruleId);
  if (!rule) throw new OperationError("設定が見つかりません");
  await repo.deleteRule(rule.id);
  await audit(repo, admin, l, "availability_rule_deleted", { rule });
}

/** メニューの追加・編集。料金・時間を変えたら公開承認をやり直す（未承認の料金を公開しない） */
export async function saveService(repo: Repo, admin: AdminContext | null, locationId: string, serviceId: string | null, form: Record<string, unknown>) {
  const l = await loc(repo, locationId);
  assertPermission(admin, "settings", l.controller);
  const p = serviceInputSchema.safeParse(form);
  if (!p.success) throw new OperationError("メニューの入力内容をご確認ください（時間は10〜240分）");
  const bad = findGuaranteeExpression(`${p.data.name} ${p.data.description}`);
  if (bad) throw new OperationError(`医療効果を保証する表現（「${bad}」）は使えません`);
  if (serviceId) {
    const cur = await repo.getService(serviceId);
    if (!cur || cur.location_id !== l.id) throw new OperationError("メニューが見つかりません");
    const priceChanged = cur.price_tax_included !== p.data.price_tax_included || cur.duration_minutes !== p.data.duration_minutes;
    const patch: Partial<Service> = { ...p.data, ...(priceChanged ? { price_status: "proposed", is_published: false, price_approval_note: null } : {}) };
    await repo.updateService(cur.id, patch);
    await audit(repo, admin, l, "service_updated", { service_id: cur.id, ...p.data, reapproval_required: priceChanged });
  } else {
    const s = await repo.insertService({ ...p.data, location_id: l.id, controller: l.controller, price_status: "proposed", price_approval_note: null, is_published: false });
    await audit(repo, admin, l, "service_created", { service_id: s.id, ...p.data });
  }
}

/** 料金の公開承認（勤務先は会社承認済みであることの記録が必須） */
export async function publishService(repo: Repo, admin: AdminContext | null, serviceId: string, publish: boolean, note: string) {
  const s = await repo.getService(serviceId);
  if (!s) throw new OperationError("メニューが見つかりません");
  const l = await loc(repo, s.location_id);
  assertPermission(admin, "approve_gates", l.controller);
  if (publish) {
    if (s.price_tax_included === null) throw new OperationError("料金が未設定のメニューは公開できません");
    if (l.kind === "workplace" && note.trim().length < 4) throw new OperationError("会社が承認した料金であることの記録（承認者・日付など）を入力してください");
    await repo.updateService(s.id, { price_status: "approved", is_published: true, price_approval_note: note.slice(0, 300) || "公開承認" });
  } else {
    await repo.updateService(s.id, { is_published: false });
  }
  await audit(repo, admin, l, publish ? "service_published" : "service_unpublished", { service_id: s.id, price: s.price_tax_included, note: note.slice(0, 300) });
}

export async function addBlock(repo: Repo, admin: AdminContext | null, form: Record<string, string>) {
  const locationId = form.location_id || null;
  const l = locationId ? await loc(repo, locationId) : null;
  assertPermission(admin, "settings", l?.controller ?? null);
  let start: Date, end: Date;
  try {
    start = jstDateTime(form.date, form.start_time);
    end = jstDateTime(form.end_date || form.date, form.end_time);
  } catch {
    throw new OperationError("日時を正しく入力してください");
  }
  if (start >= end) throw new OperationError("終了は開始より後にしてください");
  const b = await repo.insertBlock({ location_id: l?.id ?? null, practitioner_key: PRACTITIONER, start_at: start.toISOString(), end_at: end.toISOString(), reason: (form.reason ?? "").slice(0, 100) || null, created_by: admin!.email });
  await audit(repo, admin!, l, "block_added", { block_id: b.id, start: b.start_at, end: b.end_at, all_locations: !l });
}

export async function deleteBlock(repo: Repo, admin: AdminContext | null, blockId: string) {
  assertPermission(admin, "settings");
  const b = await repo.deleteBlock(blockId);
  if (!b) throw new OperationError("ブロックが見つかりません");
  const l = b.location_id ? await repo.getLocation(b.location_id) : null;
  await audit(repo, admin, l, "block_deleted", { block_id: b.id, start: b.start_at, end: b.end_at });
}
