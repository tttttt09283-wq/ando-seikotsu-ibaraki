import { addDays, daysBetween, type IsoDate } from "@/lib/dates";
import type { CustomerSnapshot, EvaluateOptions, EvaluateResult, FollowupRule } from "./types";

const PREFIX: Record<FollowupRule["rule_type"], string> = {
  days_since_first_visit: "fv",
  days_since_last_visit: "lv",
  no_confirmed_next_appointment: "na",
  days_since_last_followup: "lf",
};

/** ルールの起点日（どの出来事を起点にしたタスクか） */
export function anchorDate(rule: FollowupRule, c: CustomerSnapshot): IsoDate | null {
  switch (rule.rule_type) {
    case "days_since_first_visit":
      return c.first_visit_on;
    case "days_since_last_visit":
    case "no_confirmed_next_appointment":
      return c.last_visit_on;
    case "days_since_last_followup":
      return c.last_followup_on;
  }
}

/** 重複防止キー。同じ起点に対しては常に同じ値になる */
export function periodKey(rule: FollowupRule, anchor: IsoDate): string {
  return `${PREFIX[rule.rule_type]}:${anchor}`;
}

/**
 * 1顧客 × 1ルールの判定（純粋関数・DB アクセスなし）。
 * 除外条件 → 起点日の有無 → 経過日数（offset 以上・offset+lookback 以下）→ 種別固有条件 の順に判定する。
 */
export function evaluateRule(
  rule: FollowupRule,
  c: CustomerSnapshot,
  asOf: IsoDate,
  opts: EvaluateOptions,
): EvaluateResult {
  if (!rule.is_active) return { eligible: false, reason: "inactive_rule" };
  if (c.is_deleted) return { eligible: false, reason: "deleted" };
  if (rule.store_id !== null && rule.store_id !== c.store_id) return { eligible: false, reason: "store_mismatch" };

  if (rule.task_kind === "contact") {
    if (c.contact_status === "not_allowed" || c.contact_status === "unsubscribed") {
      return { eligible: false, reason: "contact_not_allowed" };
    }
    if (c.contact_status === "unknown" && !opts.includeUnknownConsent) {
      return { eligible: false, reason: "consent_unknown" };
    }
  }

  const anchor = anchorDate(rule, c);
  if (!anchor) return { eligible: false, reason: "no_anchor" };

  const elapsed = daysBetween(anchor, asOf);
  if (elapsed < rule.offset_days) return { eligible: false, reason: "not_yet" };
  if (elapsed > rule.offset_days + rule.max_lookback_days) return { eligible: false, reason: "too_old" };

  if (rule.rule_type === "no_confirmed_next_appointment" && c.next_appointment_at !== null) {
    return { eligible: false, reason: "has_appointment" };
  }

  return {
    eligible: true,
    periodKey: periodKey(rule, anchor),
    anchorOn: anchor,
    dueOn: addDays(asOf, rule.due_in_days),
  };
}

/**
 * 既存の未完了タスクについて、条件が解消したか（＝自動で対象外にしてよいか）。
 * 起点が変わった（再来店・新しいフォロー）か、予約未確認ルールで予約が入った場合に true。
 * 「遡り期間外になった」だけでは解消とみなさない。
 */
export function isConditionResolved(rule: FollowupRule, taskPeriodKey: string, c: CustomerSnapshot): boolean {
  const anchor = anchorDate(rule, c);
  if (!anchor || periodKey(rule, anchor) !== taskPeriodKey) return true;
  if (rule.rule_type === "no_confirmed_next_appointment" && c.next_appointment_at !== null) return true;
  return false;
}

export type Membership = { user_id: string; role: "org_admin" | "store_manager" | "staff"; store_id: string | null };

/** 担当者の決定：顧客の担当 → 店舗責任者（1名のみの場合）→ 未割当 */
export function resolveAssignee(
  rule: FollowupRule,
  c: CustomerSnapshot,
  memberships: readonly Membership[],
): string | null {
  const activeInStore = (userId: string) =>
    memberships.some((m) => m.user_id === userId && (m.role === "org_admin" || m.store_id === c.store_id));

  if (rule.assignee_strategy === "unassigned") return null;
  if (rule.assignee_strategy === "customer_staff" && c.assigned_staff_id && activeInStore(c.assigned_staff_id)) {
    return c.assigned_staff_id;
  }
  const managers = [
    ...new Set(memberships.filter((m) => m.role === "store_manager" && m.store_id === c.store_id).map((m) => m.user_id)),
  ];
  return managers.length === 1 ? managers[0] : null;
}
