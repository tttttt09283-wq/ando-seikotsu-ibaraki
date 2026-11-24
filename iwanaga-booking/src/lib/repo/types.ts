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
  ReservationStatus,
  Service,
} from "../domain/types";

export interface HoldRequest {
  reservation: Pick<
    Reservation,
    | "id"
    | "code"
    | "location_id"
    | "service_id"
    | "practitioner_key"
    | "start_at"
    | "end_at"
    | "block_start_at"
    | "block_end_at"
    | "service_snapshot"
    | "consultation_enc"
    | "source"
    | "line_verify_hash"
    | "view_token_hash"
    | "liff_user_hash"
    | "hold_expires_at"
  >;
  customer: Pick<Customer, "name_enc" | "phone_enc" | "phone_hash">;
  consents: Array<Pick<Consent, "consent_type" | "document_version">>;
  liffLine: Pick<LineAccount, "line_user_hash" | "line_user_enc"> | null;
}

export type HoldResult =
  | { ok: true; reservationId: string; customerId: string }
  | {
      ok: false;
      reason: "no_location" | "location_closed" | "service_unavailable" | "blocked" | "conflict" | "daily_limit" | "duplicate";
    };

export type AuditInput = Pick<AuditLog, "actor_type" | "actor_id" | "action"> & { detail?: Record<string, unknown> };

/** 状態遷移で変更してよい列（それ以外の列は transition では変えない） */
export type TransitionPatch = Partial<
  Pick<
    Reservation,
    | "status"
    | "line_received_at"
    | "line_match_method"
    | "hold_expires_at"
    | "confirmed_at"
    | "confirmed_by"
    | "cancelled_at"
    | "cancel_reason"
    | "completed_at"
    | "notice_status"
    | "consultation_enc"
  >
>;

export interface ReservationFilter {
  from?: string; // start_at >= from
  to?: string; // start_at < to
  statuses?: ReservationStatus[];
  locationIds?: string[];
  controllers?: ControllerId[];
  code?: string;
  customerIds?: string[];
  limit?: number;
}

export interface Repo {
  readonly kind: "memory" | "postgres";

  listLocations(): Promise<Location[]>;
  getLocation(id: string): Promise<Location | null>;
  updateLocation(id: string, patch: Partial<Location>): Promise<Location>;

  listServices(locationId?: string): Promise<Service[]>;
  getService(id: string): Promise<Service | null>;
  insertService(s: Omit<Service, "id">): Promise<Service>;
  updateService(id: string, patch: Partial<Service>): Promise<Service>;

  listRules(locationId?: string): Promise<AvailabilityRule[]>;
  insertRule(r: Omit<AvailabilityRule, "id">): Promise<AvailabilityRule>;
  deleteRule(id: string): Promise<void>;

  listBlocks(from: string, to: string): Promise<BlockedSlot[]>;
  insertBlock(b: Omit<BlockedSlot, "id"> & { created_by?: string | null }): Promise<BlockedSlot>;
  deleteBlock(id: string): Promise<BlockedSlot | null>;

  getReservation(id: string): Promise<Reservation | null>;
  getReservationByCode(code: string): Promise<Reservation | null>;
  searchReservations(f: ReservationFilter): Promise<Reservation[]>;
  /** 施術者の、期間に重なる占有中（ACTIVE）の予約（拠点を問わない） */
  listActiveReservations(practitionerKey: string, from: string, to: string): Promise<Reservation[]>;

  /** 原子的に：期限切れ解放 → 受付可否・衝突判定 → 顧客・予約・同意・監査を保存 */
  createHold(req: HoldRequest, now: Date): Promise<HoldResult>;
  /** 楽観ロック付きの状態遷移＋監査ログ。期待値と違えば null（二重操作の防止） */
  transition(
    id: string,
    expectedStatus: ReservationStatus,
    expectedVersion: number,
    patch: TransitionPatch,
    audit: AuditInput,
    now: Date,
  ): Promise<Reservation | null>;
  proposeChange(
    id: string,
    expectedStatus: ReservationStatus,
    expectedVersion: number,
    range: { start_at: string; end_at: string; block_end_at: string; hold_expires_at: string },
    audit: AuditInput,
    now: Date,
  ): Promise<{ ok: true } | { ok: false; reason: string }>;
  expireStaleHolds(now: Date): Promise<Reservation[]>;
  /** 通知結果だけを更新（予約ステータス・バージョンは変えない） */
  setNoticeStatus(id: string, status: Reservation["notice_status"]): Promise<void>;

  getCustomer(id: string): Promise<Customer | null>;
  findCustomersByPhoneHash(phoneHash: string): Promise<Customer[]>;
  anonymizeCustomer(id: string, now: Date): Promise<void>;

  getLineAccountByCustomer(customerId: string): Promise<LineAccount | null>;
  findLineAccount(locationId: string, lineUserHash: string): Promise<LineAccount | null>;
  linkLineAccount(a: Omit<LineAccount, "id" | "created_at">): Promise<LineAccount>;

  listConsents(reservationId: string): Promise<Consent[]>;

  addAudit(a: Omit<AuditLog, "id" | "at"> & { at?: string }): Promise<void>;
  listAudit(f: { reservationId?: string; controllers?: ControllerId[]; limit?: number }): Promise<AuditLog[]>;

  addNotification(n: Omit<NotificationLog, "id" | "created_at" | "read_at">): Promise<NotificationLog>;
  listNotifications(f: { reservationId?: string; recipient?: "customer" | "admin"; controllers?: ControllerId[]; limit?: number }): Promise<NotificationLog[]>;
  markAdminNotificationsRead(now: Date): Promise<void>;

  /** Webhookイベントを記録。既に記録済み（再送・重複）なら false */
  recordWebhookEvent(id: string, eventType: string): Promise<boolean>;
  setWebhookEventResult(id: string, result: string): Promise<void>;

  getAdminUserByAuthId(authUserId: string): Promise<AdminUser | null>;

  /** 保持期間を過ぎた相談内容の削除と、顧客情報の匿名化 */
  runRetention(now: Date, consultationBefore: Date, customerBefore: Date): Promise<{ consultations: number; customers: number }>;
}
