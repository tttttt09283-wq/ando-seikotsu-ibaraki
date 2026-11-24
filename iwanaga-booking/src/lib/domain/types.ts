/**
 * ドメインの型定義。DB（supabase/migrations）と 1 対 1 で対応させる。
 * 個人情報（氏名・電話・相談内容・LINEユーザーID）は暗号化済みの値（*_enc）とハッシュ（*_hash）だけを持つ。
 */

/** 管理主体（個人情報の管理責任者）。事業をまたいだ個人情報の利用はしない。 */
export type ControllerId = "iwanaga_private" | "enejoy_hand";

export type LocationKind = "home" | "workplace";

export type ReservationStatus =
  | "draft" // 入力中（サーバーには保存しない。ブラウザ内のみ）
  | "pending_line" // フォーム保存済み・LINE送信待ち
  | "pending_review" // LINE受付確認済み・管理者確認待ち
  | "confirmed" // 予約確定（管理者のみ）
  | "change_proposed" // 日時変更提案中
  | "cancelled"
  | "expired"
  | "completed";

/** 枠を占有するステータス（期限内のホールドを含む） */
export const ACTIVE_STATUSES: ReservationStatus[] = ["pending_line", "pending_review", "confirmed", "change_proposed"];
/** 期限付きホールドのステータス */
export const HOLD_STATUSES: ReservationStatus[] = ["pending_line", "pending_review", "change_proposed"];

export type NoticeStatus = "none" | "sent" | "failed" | "manual_required";

export interface Location {
  id: string; // "home" | "ibaraki" | "korien"
  controller: ControllerId;
  kind: LocationKind;
  name: string;
  short_name: string;
  /** 公開してよい所在地表示（自宅院は市区町村まで） */
  public_area: string;
  /** 自宅院の詳細住所など。予約確定した本人にだけ案内する。公開APIでは返さない */
  private_address: string | null;
  is_active: boolean;
  /** 管理者が受付を開始したか */
  booking_enabled: boolean;
  /** 自宅院：開業許可・準備完了 */
  opening_ready: boolean;
  /** 勤務先：個人LINE・本予約システムでの予約受付について会社の正式承認があるか */
  company_approved: boolean;
  company_approval_note: string | null;
  company_approved_at: string | null;
  buffer_minutes: number;
  travel_minutes: number;
  booking_deadline_hours: number;
  max_advance_days: number;
  daily_limit: number;
  slot_interval_minutes: number;
  /** 個人情報の取扱い（院ごとに表示） */
  controller_name: string;
  privacy_purpose: string;
  privacy_access: string;
  cancel_policy: string;
  precautions: string;
  contact_info: string;
  sort_order: number;
}

export interface Service {
  id: string;
  location_id: string;
  controller: ControllerId;
  name: string;
  description: string;
  duration_minutes: number;
  price_tax_included: number | null;
  /** proposed=提案価格（未承認） approved=公開承認済み（勤務先は会社承認済み） */
  price_status: "proposed" | "approved";
  price_approval_note: string | null;
  is_published: boolean;
  sort_order: number;
}

export interface AvailabilityRule {
  id: string;
  location_id: string;
  /** 0=日〜6=土。specific_date と排他 */
  weekday: number | null;
  /** YYYY-MM-DD（Asia/Tokyo）。指定日の営業時間・休業日。曜日ルールより優先 */
  specific_date: string | null;
  start_time: string | null; // "HH:MM"
  end_time: string | null;
  is_closed: boolean;
  note: string | null;
}

export interface BlockedSlot {
  id: string;
  /** null = 施術者本人の予定（全拠点をブロック） */
  location_id: string | null;
  practitioner_key: string;
  start_at: string;
  end_at: string;
  reason: string | null;
}

export interface ServiceSnapshot {
  name: string;
  duration_minutes: number;
  price_tax_included: number;
}

export interface Reservation {
  id: string;
  code: string; // 例: IW-7K3P9Q（利用者に見せる予約番号）
  controller: ControllerId;
  location_id: string;
  service_id: string;
  customer_id: string;
  practitioner_key: string;
  status: ReservationStatus;
  start_at: string;
  end_at: string;
  /** 枠の占有範囲（終了＋バッファまで）。DBの排他制約に使う */
  block_start_at: string;
  block_end_at: string;
  service_snapshot: ServiceSnapshot;
  consultation_enc: string | null;
  source: string | null;
  line_verify_hash: string;
  view_token_hash: string;
  /** LIFF / LINE Login で本人確認できたLINEユーザー（ハッシュ） */
  liff_user_hash: string | null;
  line_received_at: string | null;
  line_match_method: "webhook" | "manual" | null;
  hold_expires_at: string | null;
  previous_start_at: string | null;
  previous_end_at: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  completed_at: string | null;
  notice_status: NoticeStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  controller: ControllerId;
  location_id: string;
  name_enc: string;
  phone_enc: string;
  phone_hash: string;
  created_at: string;
  last_reserved_at: string;
  anonymized_at: string | null;
}

export interface LineAccount {
  id: string;
  controller: ControllerId;
  location_id: string;
  customer_id: string;
  line_user_hash: string;
  line_user_enc: string;
  linked_via: "webhook" | "liff" | "manual";
  created_at: string;
}

export type NotificationChannel = "line_push" | "line_reply" | "email" | "admin_panel" | "manual";
export type NotificationKind =
  | "new_hold"
  | "line_received"
  | "confirmed"
  | "change_proposed"
  | "cancelled"
  | "expired";

export interface NotificationLog {
  id: string;
  reservation_id: string | null;
  controller: ControllerId | null;
  location_id: string | null;
  channel: NotificationChannel;
  recipient: "customer" | "admin";
  kind: NotificationKind;
  status: "sent" | "failed" | "skipped" | "manual_required";
  /** 管理画面に出す要約（個人情報は含めない） */
  summary: string;
  error: string | null;
  attempt: number;
  read_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  at: string;
  actor_type: "admin" | "customer" | "system" | "line_webhook";
  actor_id: string | null;
  controller: ControllerId | null;
  location_id: string | null;
  reservation_id: string | null;
  action: string;
  from_status: ReservationStatus | null;
  to_status: ReservationStatus | null;
  detail: Record<string, unknown>;
}

export type AdminRole = "owner" | "staff";
export type Permission =
  | "view" // 予約の閲覧
  | "operate" // 承認・変更提案・キャンセル・LINE手動照合
  | "settings" // 営業時間・メニュー・ブロック
  | "approve_gates" // 開業準備完了・会社承認・料金の公開承認
  | "export" // CSV出力
  | "audit"; // 監査ログ閲覧

export interface AdminUser {
  id: string;
  auth_user_id: string | null;
  email: string;
  display_name: string;
  role: AdminRole;
  allowed_controllers: ControllerId[];
  can_export: boolean;
  is_active: boolean;
}

export interface Consent {
  id: string;
  reservation_id: string;
  customer_id: string;
  controller: ControllerId;
  location_id: string;
  consent_type: "privacy" | "cancel_policy";
  document_version: string;
  agreed_at: string;
}

export interface LineWebhookEvent {
  webhook_event_id: string;
  received_at: string;
  event_type: string;
  result: string;
}
