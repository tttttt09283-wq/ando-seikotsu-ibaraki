/**
 * ローカル代替モードのリポジトリ（メモリ＋任意で JSON ファイル保存）。
 * DB 関数（create_reservation_hold 等）と同じ判定を、ミューテックスで直列化して行う。
 * 本番では使わない（config.assertModeAllowed）。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { conflictsWithBlocks, conflictsWithReservations } from "../domain/availability";
import { locationGate, serviceGate } from "../domain/gate";
import {
  ACTIVE_STATUSES,
  HOLD_STATUSES,
  type AuditLog,
  type AvailabilityRule,
  type BlockedSlot,
  type Consent,
  type Customer,
  type LineAccount,
  type Location,
  type LineWebhookEvent,
  type NotificationLog,
  type Reservation,
} from "../domain/types";
import { jstDateKey } from "../time";
import { SEED_LOCATIONS, SEED_RULES, SEED_SERVICES } from "./seed";
import type { AuditInput, HoldRequest, HoldResult, Repo, ReservationFilter, TransitionPatch } from "./types";
import type { Service } from "../domain/types";

interface State {
  locations: Location[];
  services: Service[];
  rules: AvailabilityRule[];
  blocks: BlockedSlot[];
  customers: Customer[];
  lineAccounts: LineAccount[];
  reservations: Reservation[];
  consents: Consent[];
  notifications: NotificationLog[];
  audit: AuditLog[];
  webhookEvents: LineWebhookEvent[];
}

const uuid = () => crypto.randomUUID();
const clone = <T>(v: T): T => structuredClone(v);

function seedState(): State {
  return {
    locations: clone(SEED_LOCATIONS),
    services: SEED_SERVICES.map((s) => ({ ...s, id: uuid() })),
    rules: SEED_RULES.map((r) => ({ ...r, id: uuid() })),
    blocks: [],
    customers: [],
    lineAccounts: [],
    reservations: [],
    consents: [],
    notifications: [],
    audit: [],
    webhookEvents: [],
  };
}

export class MemoryRepo implements Repo {
  readonly kind = "memory" as const;
  private s: State;
  private lock: Promise<unknown> = Promise.resolve();

  constructor(private readonly file?: string) {
    if (file && existsSync(file)) {
      this.s = { ...seedState(), ...(JSON.parse(readFileSync(file, "utf8")) as State) };
    } else {
      this.s = seedState();
    }
  }

  /** 書き込みを直列化（DB のアドバイザリロック相当） */
  private exclusive<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => undefined);
    return run.then((v) => {
      this.persist();
      return v;
    });
  }

  private persist() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.s));
    renameSync(tmp, this.file);
  }

  /** テスト用：状態を直接操作する */
  _state(): State {
    return this.s;
  }

  async listLocations() {
    return clone([...this.s.locations].sort((a, b) => a.sort_order - b.sort_order));
  }
  async getLocation(id: string) {
    return clone(this.s.locations.find((l) => l.id === id) ?? null);
  }
  updateLocation(id: string, patch: Partial<Location>) {
    return this.exclusive(() => {
      const l = this.s.locations.find((x) => x.id === id);
      if (!l) throw new Error("location not found");
      const next = { ...l, ...patch, id: l.id, controller: l.controller, kind: l.kind };
      // DB の locations_gate 制約と同じ
      if (next.booking_enabled && !((next.kind === "home" && next.opening_ready) || (next.kind === "workplace" && next.company_approved && next.company_approved_at)))
        throw new Error("locations_gate: 受付開始には開業準備完了（自宅）または会社承認（勤務先）が必要です");
      Object.assign(l, next);
      return clone(l);
    });
  }

  async listServices(locationId?: string) {
    return clone(this.s.services.filter((s) => !locationId || s.location_id === locationId).sort((a, b) => a.sort_order - b.sort_order));
  }
  async getService(id: string) {
    return clone(this.s.services.find((s) => s.id === id) ?? null);
  }
  insertService(s: Omit<Service, "id">) {
    return this.exclusive(() => {
      const loc = this.s.locations.find((l) => l.id === s.location_id);
      if (!loc || loc.controller !== s.controller) throw new Error("services: location/controller mismatch");
      checkServicePublish(s);
      const row = { ...s, id: uuid() };
      this.s.services.push(row);
      return clone(row);
    });
  }
  updateService(id: string, patch: Partial<Service>) {
    return this.exclusive(() => {
      const svc = this.s.services.find((x) => x.id === id);
      if (!svc) throw new Error("service not found");
      const next = { ...svc, ...patch, id: svc.id, location_id: svc.location_id, controller: svc.controller };
      checkServicePublish(next);
      Object.assign(svc, next);
      return clone(svc);
    });
  }

  async listRules(locationId?: string) {
    return clone(this.s.rules.filter((r) => !locationId || r.location_id === locationId));
  }
  insertRule(r: Omit<AvailabilityRule, "id">) {
    return this.exclusive(() => {
      const row = { ...r, id: uuid() };
      this.s.rules.push(row);
      return clone(row);
    });
  }
  deleteRule(id: string) {
    return this.exclusive(() => {
      this.s.rules = this.s.rules.filter((r) => r.id !== id);
    });
  }

  async listBlocks(from: string, to: string) {
    const f = new Date(from).getTime();
    const t = new Date(to).getTime();
    return clone(this.s.blocks.filter((b) => new Date(b.start_at).getTime() < t && new Date(b.end_at).getTime() > f));
  }
  insertBlock(b: Omit<BlockedSlot, "id"> & { created_by?: string | null }) {
    return this.exclusive(() => {
      if (new Date(b.start_at) >= new Date(b.end_at)) throw new Error("blocked_slots: start_at < end_at");
      const row: BlockedSlot = {
        id: uuid(),
        location_id: b.location_id,
        practitioner_key: b.practitioner_key,
        start_at: b.start_at,
        end_at: b.end_at,
        reason: b.reason,
      };
      this.s.blocks.push(row);
      return clone(row);
    });
  }
  deleteBlock(id: string) {
    return this.exclusive(() => {
      const b = this.s.blocks.find((x) => x.id === id) ?? null;
      this.s.blocks = this.s.blocks.filter((x) => x.id !== id);
      return clone(b);
    });
  }

  async getReservation(id: string) {
    return clone(this.s.reservations.find((r) => r.id === id) ?? null);
  }
  async getReservationByCode(code: string) {
    return clone(this.s.reservations.find((r) => r.code === code) ?? null);
  }
  async searchReservations(f: ReservationFilter) {
    let rows = this.s.reservations.filter(
      (r) =>
        (!f.from || r.start_at >= f.from) &&
        (!f.to || r.start_at < f.to) &&
        (!f.statuses || f.statuses.includes(r.status)) &&
        (!f.locationIds || f.locationIds.includes(r.location_id)) &&
        (!f.controllers || f.controllers.includes(r.controller)) &&
        (!f.code || r.code === f.code) &&
        (!f.customerIds || f.customerIds.includes(r.customer_id)),
    );
    rows = rows.sort((a, b) => a.start_at.localeCompare(b.start_at));
    return clone(rows.slice(0, f.limit ?? 1000));
  }
  async listActiveReservations(practitionerKey: string, from: string, to: string) {
    const f = new Date(from).getTime();
    const t = new Date(to).getTime();
    return clone(
      this.s.reservations.filter(
        (r) =>
          r.practitioner_key === practitionerKey &&
          ACTIVE_STATUSES.includes(r.status) &&
          new Date(r.start_at).getTime() < t &&
          new Date(r.block_end_at).getTime() > f,
      ),
    );
  }

  private expireLocked(now: Date): Reservation[] {
    const out: Reservation[] = [];
    for (const r of this.s.reservations) {
      if (HOLD_STATUSES.includes(r.status) && r.hold_expires_at && new Date(r.hold_expires_at).getTime() <= now.getTime()) {
        const from = r.status;
        r.status = "expired";
        r.updated_at = now.toISOString();
        r.version += 1;
        this.pushAudit({
          at: now.toISOString(),
          actor_type: "system",
          actor_id: "expire_stale_holds",
          controller: r.controller,
          location_id: r.location_id,
          reservation_id: r.id,
          action: "hold_expired",
          from_status: null,
          to_status: "expired",
          detail: { hold_expires_at: r.hold_expires_at, from },
        });
        out.push(clone(r));
      }
    }
    return out;
  }

  private conflictLocked(locationId: string, start: string, end: string, excludeId: string | null, checkDaily: boolean): string | null {
    const loc = this.s.locations.find((l) => l.id === locationId);
    if (!loc) return "no_location";
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    if (conflictsWithBlocks({ locationId, start: s, end: e }, this.s.blocks, loc.buffer_minutes)) return "blocked";
    const active = this.s.reservations.filter((r) => ACTIVE_STATUSES.includes(r.status) && r.id !== excludeId);
    const locMap = new Map(this.s.locations.map((l) => [l.id, l]));
    const ranges = active.map((r) => ({
      reservationId: r.id,
      locationId: r.location_id,
      start: new Date(r.start_at).getTime(),
      end: new Date(r.end_at).getTime(),
    }));
    if (conflictsWithReservations({ locationId, start: s, end: e }, ranges, locMap)) return "conflict";
    if (checkDaily && loc.daily_limit > 0) {
      const day = jstDateKey(start);
      const count = active.filter((r) => r.location_id === locationId && jstDateKey(r.start_at) === day).length;
      if (count >= loc.daily_limit) return "daily_limit";
    }
    return null;
  }

  createHold(req: HoldRequest, now: Date): Promise<HoldResult> {
    return this.exclusive((): HoldResult => {
      this.expireLocked(now);
      const r = req.reservation;
      const loc = this.s.locations.find((l) => l.id === r.location_id);
      if (!loc) return { ok: false, reason: "no_location" };
      if (!locationGate(loc).ok) return { ok: false, reason: "location_closed" };
      const svc = this.s.services.find((s) => s.id === r.service_id);
      if (!svc || !serviceGate(svc, loc).ok) return { ok: false, reason: "service_unavailable" };
      const reason = this.conflictLocked(loc.id, r.start_at, r.end_at, null, true);
      if (reason) return { ok: false, reason: reason as "blocked" | "conflict" | "daily_limit" };
      if (this.s.reservations.some((x) => x.code === r.code || x.id === r.id)) return { ok: false, reason: "duplicate" };

      const iso = now.toISOString();
      let customer = this.s.customers.find((c) => c.location_id === loc.id && c.phone_hash === req.customer.phone_hash && !c.anonymized_at);
      if (!customer) {
        customer = { id: uuid(), controller: loc.controller, location_id: loc.id, ...req.customer, created_at: iso, last_reserved_at: iso, anonymized_at: null };
        this.s.customers.push(customer);
      } else {
        customer.name_enc = req.customer.name_enc;
        customer.phone_enc = req.customer.phone_enc;
        customer.last_reserved_at = iso;
      }
      const row: Reservation = {
        ...r,
        controller: loc.controller,
        customer_id: customer.id,
        status: "pending_line",
        line_received_at: null,
        line_match_method: null,
        previous_start_at: null,
        previous_end_at: null,
        confirmed_at: null,
        confirmed_by: null,
        cancelled_at: null,
        cancel_reason: null,
        completed_at: null,
        notice_status: "none",
        version: 1,
        created_at: iso,
        updated_at: iso,
      };
      this.s.reservations.push(row);
      for (const c of req.consents) {
        this.s.consents.push({ id: uuid(), reservation_id: row.id, customer_id: customer.id, controller: loc.controller, location_id: loc.id, agreed_at: iso, ...c });
      }
      if (req.liffLine && !this.s.lineAccounts.some((a) => a.location_id === loc.id && (a.line_user_hash === req.liffLine!.line_user_hash || a.customer_id === customer!.id))) {
        this.s.lineAccounts.push({ id: uuid(), controller: loc.controller, location_id: loc.id, customer_id: customer.id, linked_via: "liff", created_at: iso, ...req.liffLine });
      }
      this.pushAudit({
        at: iso,
        actor_type: "customer",
        actor_id: null,
        controller: loc.controller,
        location_id: loc.id,
        reservation_id: row.id,
        action: "reservation_created",
        from_status: "draft",
        to_status: "pending_line",
        detail: { code: row.code, source: row.source, liff: row.liff_user_hash !== null },
      });
      return { ok: true, reservationId: row.id, customerId: customer.id };
    });
  }

  transition(id: string, expectedStatus: Reservation["status"], expectedVersion: number, patch: TransitionPatch, audit: AuditInput, now: Date) {
    return this.exclusive(() => {
      const r = this.s.reservations.find((x) => x.id === id);
      if (!r || r.status !== expectedStatus || r.version !== expectedVersion) return null;
      const next = { ...r, ...patch };
      // DB の CHECK 制約と同じ
      if ((next.status === "confirmed" || next.status === "completed") && (!next.confirmed_at || !next.confirmed_by))
        throw new Error("reservations_confirm_requires_admin");
      if (["pending_review", "confirmed", "completed"].includes(next.status) && !next.line_received_at)
        throw new Error("reservations_confirm_requires_line");
      const from = r.status;
      Object.assign(r, patch, { updated_at: now.toISOString(), version: r.version + 1 });
      this.pushAudit({
        at: now.toISOString(),
        actor_type: audit.actor_type,
        actor_id: audit.actor_id,
        controller: r.controller,
        location_id: r.location_id,
        reservation_id: r.id,
        action: audit.action,
        from_status: from,
        to_status: r.status,
        detail: audit.detail ?? {},
      });
      return clone(r);
    });
  }

  proposeChange(
    id: string,
    expectedStatus: Reservation["status"],
    expectedVersion: number,
    range: { start_at: string; end_at: string; block_end_at: string; hold_expires_at: string },
    audit: AuditInput,
    now: Date,
  ) {
    return this.exclusive((): { ok: true } | { ok: false; reason: string } => {
      const r0 = this.s.reservations.find((x) => x.id === id);
      if (!r0) return { ok: false, reason: "not_found" };
      this.expireLocked(now);
      const r = r0;
      if (r.status !== expectedStatus || r.version !== expectedVersion) return { ok: false, reason: "stale" };
      const reason = this.conflictLocked(r.location_id, range.start_at, range.end_at, r.id, false);
      if (reason) return { ok: false, reason };
      const from = r.status;
      const prevStart = r.start_at;
      Object.assign(r, {
        status: "change_proposed",
        previous_start_at: r.start_at,
        previous_end_at: r.end_at,
        start_at: range.start_at,
        end_at: range.end_at,
        block_start_at: range.start_at,
        block_end_at: range.block_end_at,
        hold_expires_at: range.hold_expires_at,
        updated_at: now.toISOString(),
        version: r.version + 1,
      });
      this.pushAudit({
        at: now.toISOString(),
        actor_type: "admin",
        actor_id: audit.actor_id,
        controller: r.controller,
        location_id: r.location_id,
        reservation_id: r.id,
        action: "change_proposed",
        from_status: from,
        to_status: "change_proposed",
        detail: { from_start: prevStart, to_start: range.start_at, ...(audit.detail ?? {}) },
      });
      return { ok: true };
    });
  }

  expireStaleHolds(now: Date) {
    return this.exclusive(() => this.expireLocked(now));
  }

  setNoticeStatus(id: string, status: Reservation["notice_status"]) {
    return this.exclusive(() => {
      const r = this.s.reservations.find((x) => x.id === id);
      if (r) r.notice_status = status;
    });
  }

  async getCustomer(id: string) {
    return clone(this.s.customers.find((c) => c.id === id) ?? null);
  }
  async findCustomersByPhoneHash(phoneHash: string) {
    return clone(this.s.customers.filter((c) => c.phone_hash === phoneHash));
  }
  anonymizeCustomer(id: string, now: Date) {
    return this.exclusive(() => this.anonymizeLocked(id, now));
  }
  private anonymizeLocked(id: string, now: Date) {
    const c = this.s.customers.find((x) => x.id === id);
    if (!c || c.anonymized_at) return;
    c.name_enc = "";
    c.phone_enc = "";
    c.phone_hash = `anonymized:${c.id}`;
    c.anonymized_at = now.toISOString();
    this.s.lineAccounts = this.s.lineAccounts.filter((a) => a.customer_id !== id);
    for (const r of this.s.reservations) if (r.customer_id === id) r.consultation_enc = null;
    this.pushAudit({
      at: now.toISOString(),
      actor_type: "system",
      actor_id: "anonymize",
      controller: c.controller,
      location_id: c.location_id,
      reservation_id: null,
      action: "customer_anonymized",
      from_status: null,
      to_status: null,
      detail: { customer_id: c.id },
    });
  }

  async getLineAccountByCustomer(customerId: string) {
    return clone(this.s.lineAccounts.find((a) => a.customer_id === customerId) ?? null);
  }
  async findLineAccount(locationId: string, lineUserHash: string) {
    return clone(this.s.lineAccounts.find((a) => a.location_id === locationId && a.line_user_hash === lineUserHash) ?? null);
  }
  linkLineAccount(a: Omit<LineAccount, "id" | "created_at">) {
    return this.exclusive(() => {
      const existing = this.s.lineAccounts.find((x) => x.customer_id === a.customer_id);
      if (existing) {
        Object.assign(existing, { line_user_hash: a.line_user_hash, line_user_enc: a.line_user_enc, linked_via: a.linked_via });
        return clone(existing);
      }
      // 同じLINEユーザーが同じ拠点の別の顧客に紐づいていたら外す（unique(location_id, line_user_hash)）
      this.s.lineAccounts = this.s.lineAccounts.filter((x) => !(x.location_id === a.location_id && x.line_user_hash === a.line_user_hash));
      const row = { ...a, id: uuid(), created_at: new Date().toISOString() };
      this.s.lineAccounts.push(row);
      return clone(row);
    });
  }

  async listConsents(reservationId: string) {
    return clone(this.s.consents.filter((c) => c.reservation_id === reservationId));
  }

  private pushAudit(a: Omit<AuditLog, "id">) {
    this.s.audit.push({ ...a, id: uuid() });
  }
  addAudit(a: Omit<AuditLog, "id" | "at"> & { at?: string }) {
    return this.exclusive(() => this.pushAudit({ ...a, at: a.at ?? new Date().toISOString() }));
  }
  async listAudit(f: { reservationId?: string; controllers?: Location["controller"][]; limit?: number }) {
    return clone(
      [...this.s.audit]
        .reverse()
        .filter((a) => (!f.reservationId || a.reservation_id === f.reservationId) && (!f.controllers || a.controller === null || f.controllers.includes(a.controller)))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, f.limit ?? 200),
    );
  }

  addNotification(n: Omit<NotificationLog, "id" | "created_at" | "read_at">) {
    return this.exclusive(() => {
      const row: NotificationLog = { ...n, id: uuid(), created_at: new Date().toISOString(), read_at: null };
      this.s.notifications.push(row);
      return clone(row);
    });
  }
  async listNotifications(f: { reservationId?: string; recipient?: "customer" | "admin"; controllers?: Location["controller"][]; limit?: number }) {
    return clone(
      this.s.notifications
        .filter(
          (n) =>
            (!f.reservationId || n.reservation_id === f.reservationId) &&
            (!f.recipient || n.recipient === f.recipient) &&
            (!f.controllers || n.controller === null || f.controllers.includes(n.controller)),
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, f.limit ?? 200),
    );
  }
  markAdminNotificationsRead(now: Date) {
    return this.exclusive(() => {
      for (const n of this.s.notifications) if (n.recipient === "admin" && n.channel === "admin_panel" && !n.read_at) n.read_at = now.toISOString();
    });
  }

  recordWebhookEvent(id: string, eventType: string) {
    return this.exclusive(() => {
      if (this.s.webhookEvents.some((e) => e.webhook_event_id === id)) return false;
      this.s.webhookEvents.push({ webhook_event_id: id, event_type: eventType, received_at: new Date().toISOString(), result: "received" });
      return true;
    });
  }
  setWebhookEventResult(id: string, result: string) {
    return this.exclusive(() => {
      const e = this.s.webhookEvents.find((x) => x.webhook_event_id === id);
      if (e) e.result = result;
    });
  }

  async getAdminUserByAuthId(_authUserId: string) {
    return null; // ローカル代替モードは ADMIN_LOCAL_PASSWORD の簡易ログインのみ
  }

  runRetention(now: Date, consultationBefore: Date, customerBefore: Date) {
    return this.exclusive(() => {
      let consultations = 0;
      const cb = consultationBefore.toISOString();
      for (const r of this.s.reservations) {
        if (r.consultation_enc && ["completed", "cancelled", "expired"].includes(r.status) && r.updated_at < cb) {
          r.consultation_enc = null;
          consultations++;
        }
      }
      let customers = 0;
      const custB = customerBefore.toISOString();
      for (const c of this.s.customers) {
        if (c.anonymized_at || c.last_reserved_at >= custB) continue;
        const hasActive = this.s.reservations.some((r) => r.customer_id === c.id && ACTIVE_STATUSES.includes(r.status));
        if (hasActive) continue;
        this.anonymizeLocked(c.id, now);
        customers++;
      }
      return { consultations, customers };
    });
  }
}

function checkServicePublish(s: Pick<Service, "is_published" | "price_status" | "price_tax_included">) {
  if (s.is_published && (s.price_status !== "approved" || s.price_tax_included === null))
    throw new Error("services_publish: 料金が未承認・未設定のメニューは公開できません");
}
