/**
 * PostgreSQL（Supabase）リポジトリ。サーバーからのみ使う（DATABASE_URL はクライアントに出さない）。
 * 予約の作成・状態遷移・変更提案・期限切れ解放は DB 関数で原子的に行う（supabase/migrations）。
 */
import pg from "pg";
import type {
  AdminUser,
  AuditLog,
  AvailabilityRule,
  BlockedSlot,
  Consent,
  ControllerId,
  Customer,
  LineAccount,
  Location,
  NotificationLog,
  Reservation,
  Service,
} from "../domain/types";
import type { AuditInput, HoldRequest, HoldResult, Repo, ReservationFilter, TransitionPatch } from "./types";

const TIMESTAMPTZ = 1184;
const TIMESTAMP = 1114;
const DATE = 1082;
const TIME = 1083;

const typeParser = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    if (oid === TIMESTAMPTZ || oid === TIMESTAMP) return (v: string) => new Date(v).toISOString();
    if (oid === DATE) return (v: string) => v;
    if (oid === TIME) return (v: string) => v.slice(0, 5);
    return pg.types.getTypeParser(oid, format);
  },
} as unknown as pg.CustomTypesConfig;

export function createPool(connectionString: string, opts: { caCert?: string } = {}): pg.Pool {
  const isLocal = /@(localhost|127\.0\.0\.1)|host=%2F|host=\//.test(connectionString) || connectionString.includes("@/");
  return new pg.Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    idleTimeoutMillis: 10_000,
    types: typeParser,
    ssl: isLocal ? undefined : opts.caCert ? { ca: opts.caCert } : { rejectUnauthorized: false },
  });
}

const RES_UPDATABLE = new Set([
  "status",
  "line_received_at",
  "line_match_method",
  "hold_expires_at",
  "confirmed_at",
  "confirmed_by",
  "cancelled_at",
  "cancel_reason",
  "completed_at",
  "notice_status",
  "consultation_enc",
]);

export class PgRepo implements Repo {
  readonly kind = "postgres" as const;
  constructor(private readonly pool: pg.Pool) {}

  private async q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const r = await this.pool.query(sql, params);
    return r.rows as T[];
  }
  private async one<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.q<T>(sql, params);
    return rows[0] ?? null;
  }

  /** 列名を検証してから UPDATE 文を組み立てる（列名は固定の許可リストのみ） */
  private async updateRow<T>(table: string, id: string, patch: Record<string, unknown>, allowed: string[]): Promise<T> {
    const keys = Object.keys(patch).filter((k) => allowed.includes(k) && patch[k] !== undefined);
    if (keys.length === 0) {
      const row = await this.one<T>(`select * from public.${table} where id = $1`, [id]);
      if (!row) throw new Error(`${table} not found`);
      return row;
    }
    const sets = keys.map((k, i) => `"${k}" = $${i + 2}`);
    if (table !== "availability_rules") sets.push("updated_at = now()");
    const row = await this.one<T>(`update public.${table} set ${sets.join(", ")} where id = $1 returning *`, [id, ...keys.map((k) => patch[k])]);
    if (!row) throw new Error(`${table} not found`);
    return row;
  }

  listLocations() {
    return this.q<Location>("select * from public.locations order by sort_order");
  }
  getLocation(id: string) {
    return this.one<Location>("select * from public.locations where id = $1", [id]);
  }
  updateLocation(id: string, patch: Partial<Location>) {
    return this.updateRow<Location>("locations", id, patch as Record<string, unknown>, [
      "name",
      "short_name",
      "public_area",
      "private_address",
      "is_active",
      "booking_enabled",
      "opening_ready",
      "company_approved",
      "company_approval_note",
      "company_approved_at",
      "company_approved_by",
      "buffer_minutes",
      "travel_minutes",
      "booking_deadline_hours",
      "max_advance_days",
      "daily_limit",
      "slot_interval_minutes",
      "controller_name",
      "privacy_purpose",
      "privacy_access",
      "cancel_policy",
      "precautions",
      "contact_info",
    ]);
  }

  listServices(locationId?: string) {
    return locationId
      ? this.q<Service>("select * from public.services where location_id = $1 order by sort_order, created_at", [locationId])
      : this.q<Service>("select * from public.services order by location_id, sort_order, created_at");
  }
  getService(id: string) {
    return this.one<Service>("select * from public.services where id = $1", [id]);
  }
  async insertService(s: Omit<Service, "id">) {
    const row = await this.one<Service>(
      `insert into public.services (location_id, controller, name, description, duration_minutes, price_tax_included, price_status, price_approval_note, is_published, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [s.location_id, s.controller, s.name, s.description, s.duration_minutes, s.price_tax_included, s.price_status, s.price_approval_note, s.is_published, s.sort_order],
    );
    return row as Service;
  }
  updateService(id: string, patch: Partial<Service>) {
    return this.updateRow<Service>("services", id, patch as Record<string, unknown>, [
      "name",
      "description",
      "duration_minutes",
      "price_tax_included",
      "price_status",
      "price_approval_note",
      "is_published",
      "sort_order",
    ]);
  }

  listRules(locationId?: string) {
    return locationId
      ? this.q<AvailabilityRule>("select * from public.availability_rules where location_id = $1 order by specific_date nulls first, weekday, start_time", [locationId])
      : this.q<AvailabilityRule>("select * from public.availability_rules order by location_id, specific_date nulls first, weekday, start_time");
  }
  async insertRule(r: Omit<AvailabilityRule, "id">) {
    return (await this.one<AvailabilityRule>(
      `insert into public.availability_rules (location_id, weekday, specific_date, start_time, end_time, is_closed, note)
       values ($1,$2,$3,$4,$5,$6,$7) returning *`,
      [r.location_id, r.weekday, r.specific_date, r.start_time, r.end_time, r.is_closed, r.note],
    )) as AvailabilityRule;
  }
  async deleteRule(id: string) {
    await this.q("delete from public.availability_rules where id = $1", [id]);
  }

  listBlocks(from: string, to: string) {
    return this.q<BlockedSlot>(
      "select * from public.blocked_slots where tstzrange(start_at, end_at, '[)') && tstzrange($1::timestamptz, $2::timestamptz, '[)') order by start_at",
      [from, to],
    );
  }
  async insertBlock(b: Omit<BlockedSlot, "id"> & { created_by?: string | null }) {
    return (await this.one<BlockedSlot>(
      `insert into public.blocked_slots (location_id, practitioner_key, start_at, end_at, reason, created_by) values ($1,$2,$3,$4,$5,$6) returning *`,
      [b.location_id, b.practitioner_key, b.start_at, b.end_at, b.reason, b.created_by ?? null],
    )) as BlockedSlot;
  }
  deleteBlock(id: string) {
    return this.one<BlockedSlot>("delete from public.blocked_slots where id = $1 returning *", [id]);
  }

  getReservation(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Promise.resolve(null);
    return this.one<Reservation>("select * from public.reservations where id = $1", [id]);
  }
  getReservationByCode(code: string) {
    return this.one<Reservation>("select * from public.reservations where code = $1", [code]);
  }
  searchReservations(f: ReservationFilter) {
    const where: string[] = [];
    const p: unknown[] = [];
    const add = (sql: string, v: unknown) => {
      p.push(v);
      where.push(sql.replace("?", `$${p.length}`));
    };
    if (f.from) add("start_at >= ?", f.from);
    if (f.to) add("start_at < ?", f.to);
    if (f.statuses) add("status = any(?)", f.statuses);
    if (f.locationIds) add("location_id = any(?)", f.locationIds);
    if (f.controllers) add("controller = any(?)", f.controllers);
    if (f.code) add("code = ?", f.code);
    if (f.customerIds) add("customer_id = any(?::uuid[])", f.customerIds);
    p.push(Math.min(f.limit ?? 1000, 5000));
    return this.q<Reservation>(
      `select * from public.reservations ${where.length ? "where " + where.join(" and ") : ""} order by start_at limit $${p.length}`,
      p,
    );
  }
  listActiveReservations(practitionerKey: string, from: string, to: string) {
    return this.q<Reservation>(
      `select * from public.reservations
        where practitioner_key = $1 and status in ('pending_line','pending_review','confirmed','change_proposed')
          and start_at < $3 and block_end_at > $2 order by start_at`,
      [practitionerKey, from, to],
    );
  }

  async createHold(req: HoldRequest, now: Date): Promise<HoldResult> {
    const row = await this.one<{ r: HoldResult & { reservation_id?: string; customer_id?: string } }>(
      "select public.create_reservation_hold($1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb, $5) as r",
      [JSON.stringify(req.reservation), JSON.stringify(req.customer), JSON.stringify(req.consents), req.liffLine ? JSON.stringify(req.liffLine) : null, now.toISOString()],
    );
    const r = row!.r as { ok: boolean; reason?: string; reservation_id?: string; customer_id?: string };
    if (r.ok) return { ok: true, reservationId: r.reservation_id!, customerId: r.customer_id! };
    return { ok: false, reason: r.reason as Extract<HoldResult, { ok: false }>["reason"] };
  }

  async transition(id: string, expectedStatus: Reservation["status"], expectedVersion: number, patch: TransitionPatch, audit: AuditInput, now: Date) {
    for (const k of Object.keys(patch)) if (!RES_UPDATABLE.has(k)) throw new Error(`transition: column ${k} is not updatable`);
    const row = await this.one<Reservation & { id: string | null }>(
      "select * from public.transition_reservation($1, $2, $3, $4::jsonb, $5::jsonb, $6)",
      [id, expectedStatus, expectedVersion, JSON.stringify(patch), JSON.stringify(audit), now.toISOString()],
    );
    return row && row.id ? (row as Reservation) : null;
  }

  async proposeChange(
    id: string,
    expectedStatus: Reservation["status"],
    expectedVersion: number,
    range: { start_at: string; end_at: string; block_end_at: string; hold_expires_at: string },
    audit: AuditInput,
    now: Date,
  ) {
    const row = await this.one<{ r: { ok: boolean; reason?: string } }>(
      "select public.propose_reservation_change($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9) as r",
      [id, expectedStatus, expectedVersion, range.start_at, range.end_at, range.block_end_at, range.hold_expires_at, JSON.stringify(audit), now.toISOString()],
    );
    const r = row!.r;
    return r.ok ? ({ ok: true } as const) : ({ ok: false, reason: r.reason ?? "error" } as const);
  }

  expireStaleHolds(now: Date) {
    return this.q<Reservation>("select * from public.expire_stale_holds($1)", [now.toISOString()]);
  }

  async setNoticeStatus(id: string, status: Reservation["notice_status"]) {
    await this.q("update public.reservations set notice_status = $2 where id = $1", [id, status]);
  }

  getCustomer(id: string) {
    return this.one<Customer>("select * from public.customers where id = $1", [id]);
  }
  findCustomersByPhoneHash(phoneHash: string) {
    return this.q<Customer>("select * from public.customers where phone_hash = $1", [phoneHash]);
  }
  async anonymizeCustomer(id: string, now: Date) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await this.anonymizeWith(client, id, now);
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }
  private async anonymizeWith(client: pg.PoolClient, id: string, now: Date) {
    const r = await client.query(
      `update public.customers set name_enc = '', phone_enc = '', phone_hash = 'anonymized:' || id::text, anonymized_at = $2
        where id = $1 and anonymized_at is null returning controller, location_id`,
      [id, now.toISOString()],
    );
    if (r.rowCount === 0) return;
    await client.query("delete from public.line_accounts where customer_id = $1", [id]);
    await client.query("update public.reservations set consultation_enc = null where customer_id = $1", [id]);
    await client.query(
      `insert into public.audit_logs (at, actor_type, actor_id, controller, location_id, action, detail)
       values ($1, 'system', 'anonymize', $2, $3, 'customer_anonymized', jsonb_build_object('customer_id', $4::text))`,
      [now.toISOString(), r.rows[0].controller, r.rows[0].location_id, id],
    );
  }

  getLineAccountByCustomer(customerId: string) {
    return this.one<LineAccount>("select * from public.line_accounts where customer_id = $1", [customerId]);
  }
  findLineAccount(locationId: string, lineUserHash: string) {
    return this.one<LineAccount>("select * from public.line_accounts where location_id = $1 and line_user_hash = $2", [locationId, lineUserHash]);
  }
  async linkLineAccount(a: Omit<LineAccount, "id" | "created_at">) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("delete from public.line_accounts where location_id = $1 and line_user_hash = $2 and customer_id <> $3", [a.location_id, a.line_user_hash, a.customer_id]);
      const r = await client.query(
        `insert into public.line_accounts (controller, location_id, customer_id, line_user_hash, line_user_enc, linked_via)
         values ($1,$2,$3,$4,$5,$6)
         on conflict (customer_id) do update set line_user_hash = excluded.line_user_hash, line_user_enc = excluded.line_user_enc, linked_via = excluded.linked_via
         returning *`,
        [a.controller, a.location_id, a.customer_id, a.line_user_hash, a.line_user_enc, a.linked_via],
      );
      await client.query("commit");
      return r.rows[0] as LineAccount;
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }

  listConsents(reservationId: string) {
    return this.q<Consent>("select * from public.consents where reservation_id = $1 order by agreed_at", [reservationId]);
  }

  async addAudit(a: Omit<AuditLog, "id" | "at"> & { at?: string }) {
    await this.q(
      `insert into public.audit_logs (at, actor_type, actor_id, controller, location_id, reservation_id, action, from_status, to_status, detail)
       values (coalesce($1::timestamptz, now()), $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [a.at ?? null, a.actor_type, a.actor_id, a.controller, a.location_id, a.reservation_id, a.action, a.from_status, a.to_status, JSON.stringify(a.detail ?? {})],
    );
  }
  listAudit(f: { reservationId?: string; controllers?: ControllerId[]; limit?: number }) {
    const p: unknown[] = [];
    const where: string[] = [];
    if (f.reservationId) {
      p.push(f.reservationId);
      where.push(`reservation_id = $${p.length}`);
    }
    if (f.controllers) {
      p.push(f.controllers);
      where.push(`(controller is null or controller = any($${p.length}))`);
    }
    p.push(Math.min(f.limit ?? 200, 2000));
    return this.q<AuditLog>(`select * from public.audit_logs ${where.length ? "where " + where.join(" and ") : ""} order by at desc, seq desc limit $${p.length}`, p);
  }

  async addNotification(n: Omit<NotificationLog, "id" | "created_at" | "read_at">) {
    return (await this.one<NotificationLog>(
      `insert into public.notification_logs (reservation_id, controller, location_id, channel, recipient, kind, status, summary, error, attempt)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [n.reservation_id, n.controller, n.location_id, n.channel, n.recipient, n.kind, n.status, n.summary, n.error, n.attempt],
    )) as NotificationLog;
  }
  listNotifications(f: { reservationId?: string; recipient?: "customer" | "admin"; controllers?: ControllerId[]; limit?: number }) {
    const p: unknown[] = [];
    const where: string[] = [];
    if (f.reservationId) {
      p.push(f.reservationId);
      where.push(`reservation_id = $${p.length}`);
    }
    if (f.recipient) {
      p.push(f.recipient);
      where.push(`recipient = $${p.length}`);
    }
    if (f.controllers) {
      p.push(f.controllers);
      where.push(`(controller is null or controller = any($${p.length}))`);
    }
    p.push(Math.min(f.limit ?? 200, 2000));
    return this.q<NotificationLog>(
      `select * from public.notification_logs ${where.length ? "where " + where.join(" and ") : ""} order by created_at desc limit $${p.length}`,
      p,
    );
  }
  async markAdminNotificationsRead(now: Date) {
    await this.q("update public.notification_logs set read_at = $1 where recipient = 'admin' and channel = 'admin_panel' and read_at is null", [now.toISOString()]);
  }

  async recordWebhookEvent(id: string, eventType: string) {
    const r = await this.pool.query(
      "insert into public.line_webhook_events (webhook_event_id, event_type) values ($1, $2) on conflict do nothing",
      [id, eventType],
    );
    return r.rowCount === 1;
  }
  async setWebhookEventResult(id: string, result: string) {
    await this.q("update public.line_webhook_events set result = $2 where webhook_event_id = $1", [id, result]);
  }

  getAdminUserByAuthId(authUserId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(authUserId)) return Promise.resolve(null);
    return this.one<AdminUser>("select * from public.admin_users where auth_user_id = $1 and is_active", [authUserId]);
  }

  async runRetention(now: Date, consultationBefore: Date, customerBefore: Date) {
    const c = await this.pool.query(
      `update public.reservations set consultation_enc = null
        where consultation_enc is not null and status in ('completed','cancelled','expired') and updated_at < $1`,
      [consultationBefore.toISOString()],
    );
    const targets = await this.q<{ id: string }>(
      `select c.id from public.customers c
        where c.anonymized_at is null and c.last_reserved_at < $1
          and not exists (select 1 from public.reservations r where r.customer_id = c.id
                           and r.status in ('pending_line','pending_review','confirmed','change_proposed'))`,
      [customerBefore.toISOString()],
    );
    for (const t of targets) await this.anonymizeCustomer(t.id, now);
    // Webhook 重複排除の記録は 30 日で削除
    await this.q("delete from public.line_webhook_events where received_at < $1", [new Date(now.getTime() - 30 * 86_400_000).toISOString()]);
    return { consultations: c.rowCount ?? 0, customers: targets.length };
  }
}
