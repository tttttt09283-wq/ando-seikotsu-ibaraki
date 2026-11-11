import type { IsoDate } from "@/lib/dates";

export type RuleType =
  | "days_since_first_visit"
  | "days_since_last_visit"
  | "no_confirmed_next_appointment"
  | "days_since_last_followup";

export type TaskKind = "contact" | "internal";
export type Priority = "high" | "normal" | "low";
export type AssigneeStrategy = "customer_staff" | "store_manager" | "unassigned";
export type ContactStatus = "unknown" | "allowed" | "not_allowed" | "unsubscribed";

export type FollowupRule = {
  id: string;
  store_id: string | null;
  name: string;
  rule_type: RuleType;
  offset_days: number;
  due_in_days: number;
  max_lookback_days: number;
  task_kind: TaskKind;
  priority: Priority;
  assignee_strategy: AssigneeStrategy;
  default_template_id: string | null;
  is_active: boolean;
};

export type CustomerSnapshot = {
  customer_id: string;
  store_id: string;
  assigned_staff_id: string | null;
  contact_status: ContactStatus;
  first_visit_on: IsoDate | null;
  last_visit_on: IsoDate | null;
  /** 今日以降の有効な予約（scheduled/confirmed）。null は「予約未確認」（予約が無いとは断定しない） */
  next_appointment_at: string | null;
  last_followup_on: IsoDate | null;
  is_deleted: boolean;
};

export type SkipReason =
  | "inactive_rule"
  | "deleted"
  | "contact_not_allowed"
  | "consent_unknown"
  | "store_mismatch"
  | "no_anchor"
  | "not_yet"
  | "too_old"
  | "has_appointment";

export type EvaluateResult =
  | { eligible: true; periodKey: string; anchorOn: IsoDate; dueOn: IsoDate }
  | { eligible: false; reason: SkipReason };

export type EvaluateOptions = { includeUnknownConsent: boolean };

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  days_since_first_visit: "初回来店から指定日数経過",
  days_since_last_visit: "最終来店から指定日数経過",
  no_confirmed_next_appointment: "次回予約が未確認",
  days_since_last_followup: "前回フォローから指定日数経過",
};

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  inactive_rule: "ルールが無効",
  deleted: "削除済みの顧客",
  contact_not_allowed: "配信停止・連絡不可",
  consent_unknown: "連絡同意が未確認",
  store_mismatch: "対象店舗外",
  no_anchor: "起点となる記録なし",
  not_yet: "日数未経過",
  too_old: "起点が古すぎる（遡り期間外）",
  has_appointment: "次回予約あり",
};
