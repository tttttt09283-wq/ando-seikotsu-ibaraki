/**
 * ローカル代替モード用の初期データ。supabase/migrations/20261112000100_seed.sql と同じ内容。
 * （pg.test.ts で両者が一致することを確認している）
 */
import type { AvailabilityRule, Location, Service } from "../domain/types";

const homePrivacy = {
  controller_name: "岩永拓己（個人）",
  privacy_purpose:
    "ご予約の受付・内容確認・日時の調整・確定/変更/キャンセルのご連絡、当日のご案内のためにのみ利用します。勤務先（あんど整骨院）を含む他の事業への提供・転用や、広告配信への利用はいたしません。",
  privacy_access:
    "閲覧・管理できるのは岩永拓己本人のみです。お名前・電話番号・ご相談内容・LINEのユーザー識別子は暗号化して保存し、ご相談内容は施術完了・キャンセル後90日、その他の情報は最後のご予約から3年で削除します。削除のご希望は公式LINEでお申し出ください。",
};

const base = {
  is_active: true,
  booking_enabled: false,
  opening_ready: false,
  company_approved: false,
  company_approval_note: null,
  company_approved_at: null,
  private_address: null,
  max_advance_days: 60,
  booking_deadline_hours: 24,
  slot_interval_minutes: 30,
  contact_info: "公式LINE（岩永拓己）のトークでご連絡ください。",
};

export const SEED_LOCATIONS: Location[] = [
  {
    ...base,
    id: "home",
    controller: "iwanaga_private",
    kind: "home",
    name: "岩永拓己 プライベート鍼灸院",
    short_name: "自宅鍼灸院",
    public_area: "詳しい所在地は、ご予約確定後にご本人にのみご案内します",
    buffer_minutes: 15,
    travel_minutes: 60,
    daily_limit: 4,
    ...homePrivacy,
    cancel_policy: "ご予約の変更・キャンセルは、ご予約日の前日までに公式LINEでご連絡ください。",
    precautions: "体調がすぐれない日は無理をせずご連絡ください。施術の前後は飲酒をお控えください。動きやすい服装でお越しください。",
    sort_order: 1,
  },
  ...(["ibaraki", "korien"] as const).map((id, i) => ({
    ...base,
    id,
    controller: "enejoy_hand" as const,
    kind: "workplace" as const,
    name: id === "ibaraki" ? "あんど整骨院 茨木院" : "あんど整骨院 香里園院",
    short_name: id === "ibaraki" ? "茨木院" : "香里園院",
    public_area: id === "ibaraki" ? "大阪府茨木市" : "大阪府寝屋川市（香里園）",
    buffer_minutes: 10,
    travel_minutes: 60,
    daily_limit: 0,
    controller_name: "あんど整骨院（運営会社）",
    privacy_purpose: `あんど整骨院 ${id === "ibaraki" ? "茨木院" : "香里園院"}でのご予約の受付・確認・ご連絡のためにのみ利用します。岩永拓己の自宅鍼灸院など他の事業への転用や、広告配信への利用はいたしません。`,
    privacy_access: "閲覧・管理できるのは、会社が認めた範囲の担当者のみです。",
    cancel_policy: "",
    precautions: "",
    sort_order: i + 2,
  })),
];

export const SEED_SERVICES: Omit<Service, "id">[] = [
  { name: "初回", description: "カウンセリングと全身の鍼灸施術", duration_minutes: 90, price_tax_included: 12000, sort_order: 1 },
  { name: "通常", description: "2回目以降の鍼灸施術", duration_minutes: 60, price_tax_included: 10000, sort_order: 2 },
  { name: "集中", description: "時間をかけて丁寧に行う鍼灸施術", duration_minutes: 90, price_tax_included: 15000, sort_order: 3 },
].map((s) => ({
  ...s,
  location_id: "home",
  controller: "iwanaga_private" as const,
  price_status: "proposed" as const,
  price_approval_note: null,
  is_published: false,
}));

export const SEED_RULES: Omit<AvailabilityRule, "id">[] = [1, 2, 3, 4, 5, 6].map((weekday) => ({
  location_id: "home",
  weekday,
  specific_date: null,
  start_time: "10:00",
  end_time: weekday === 6 ? "17:00" : "19:00",
  is_closed: false,
  note: null,
}));
