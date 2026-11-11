import { describe, expect, it } from "vitest";
import { evaluateRule, isConditionResolved, periodKey, resolveAssignee } from "@/lib/followup/evaluate";
import type { CustomerSnapshot, FollowupRule } from "@/lib/followup/types";

const rule = (over: Partial<FollowupRule> = {}): FollowupRule => ({
  id: "r1",
  store_id: null,
  name: "テスト",
  rule_type: "days_since_last_visit",
  offset_days: 7,
  due_in_days: 3,
  max_lookback_days: 14,
  task_kind: "contact",
  priority: "normal",
  assignee_strategy: "customer_staff",
  default_template_id: null,
  is_active: true,
  ...over,
});

const cust = (over: Partial<CustomerSnapshot> = {}): CustomerSnapshot => ({
  customer_id: "c1",
  store_id: "s1",
  assigned_staff_id: "u1",
  contact_status: "allowed",
  first_visit_on: "2026-10-01",
  last_visit_on: "2026-11-01",
  next_appointment_at: null,
  last_followup_on: null,
  is_deleted: false,
  ...over,
});

const opts = { includeUnknownConsent: false };

describe("evaluateRule：経過日数の境界値", () => {
  // 最終来店 11/01、offset 7、lookback 14 → 11/08〜11/22 が対象
  it.each([
    ["2026-11-07", false, "not_yet"],
    ["2026-11-08", true, undefined],
    ["2026-11-22", true, undefined],
    ["2026-11-23", false, "too_old"],
  ])("asOf=%s → eligible=%s", (asOf, eligible, reason) => {
    const r = evaluateRule(rule(), cust(), asOf, opts);
    expect(r.eligible).toBe(eligible);
    if (!r.eligible) expect(r.reason).toBe(reason);
  });

  it("期限は asOf + due_in_days", () => {
    const r = evaluateRule(rule(), cust(), "2026-11-08", opts);
    expect(r).toMatchObject({ eligible: true, dueOn: "2026-11-11", periodKey: "lv:2026-11-01" });
  });

  it("月末・年末をまたいでも暦日で計算する", () => {
    const r = evaluateRule(rule({ offset_days: 3 }), cust({ last_visit_on: "2026-12-30" }), "2027-01-02", opts);
    expect(r.eligible).toBe(true);
  });
});

describe("evaluateRule：ルール種別", () => {
  it("初回来店から指定日数（起点は初回来店日）", () => {
    const r = evaluateRule(rule({ rule_type: "days_since_first_visit", offset_days: 1 }), cust({ first_visit_on: "2026-11-10" }), "2026-11-11", opts);
    expect(r).toMatchObject({ eligible: true, periodKey: "fv:2026-11-10" });
  });

  it("次回予約が未確認：予約データが無ければ対象（予約なしとは断定しない）", () => {
    const r = evaluateRule(rule({ rule_type: "no_confirmed_next_appointment", offset_days: 3 }), cust(), "2026-11-04", opts);
    expect(r).toMatchObject({ eligible: true, periodKey: "na:2026-11-01" });
  });

  it("次回予約が未確認：将来の予約があれば対象外", () => {
    const r = evaluateRule(
      rule({ rule_type: "no_confirmed_next_appointment", offset_days: 3 }),
      cust({ next_appointment_at: "2026-11-20T01:00:00Z" }),
      "2026-11-04",
      opts,
    );
    expect(r).toEqual({ eligible: false, reason: "has_appointment" });
  });

  it("前回フォローから指定日数：フォロー記録が無ければ対象外", () => {
    const r = evaluateRule(rule({ rule_type: "days_since_last_followup", offset_days: 90 }), cust(), "2026-11-11", opts);
    expect(r).toEqual({ eligible: false, reason: "no_anchor" });
  });

  it("前回フォローから指定日数：起点はフォロー日", () => {
    const r = evaluateRule(
      rule({ rule_type: "days_since_last_followup", offset_days: 90 }),
      cust({ last_followup_on: "2026-08-01" }),
      "2026-10-30",
      opts,
    );
    expect(r).toMatchObject({ eligible: true, periodKey: "lf:2026-08-01" });
  });

  it("来店記録が無い顧客は対象外", () => {
    const r = evaluateRule(rule(), cust({ first_visit_on: null, last_visit_on: null }), "2026-11-11", opts);
    expect(r).toEqual({ eligible: false, reason: "no_anchor" });
  });
});

describe("evaluateRule：連絡不可顧客の除外", () => {
  it.each(["unsubscribed", "not_allowed"] as const)("%s の顧客には連絡タスクを作らない", (status) => {
    const r = evaluateRule(rule(), cust({ contact_status: status }), "2026-11-08", opts);
    expect(r).toEqual({ eligible: false, reason: "contact_not_allowed" });
  });

  it("同意未確認は既定で除外、設定 ON なら対象", () => {
    expect(evaluateRule(rule(), cust({ contact_status: "unknown" }), "2026-11-08", opts)).toEqual({
      eligible: false,
      reason: "consent_unknown",
    });
    expect(evaluateRule(rule(), cust({ contact_status: "unknown" }), "2026-11-08", { includeUnknownConsent: true }).eligible).toBe(true);
  });

  it("社内作業（internal）タスクは連絡不可でも生成する", () => {
    const r = evaluateRule(rule({ task_kind: "internal" }), cust({ contact_status: "unsubscribed" }), "2026-11-08", opts);
    expect(r.eligible).toBe(true);
  });

  it("削除済み顧客・無効ルール・店舗違いは対象外", () => {
    expect(evaluateRule(rule(), cust({ is_deleted: true }), "2026-11-08", opts)).toEqual({ eligible: false, reason: "deleted" });
    expect(evaluateRule(rule({ is_active: false }), cust(), "2026-11-08", opts)).toEqual({ eligible: false, reason: "inactive_rule" });
    expect(evaluateRule(rule({ store_id: "s2" }), cust(), "2026-11-08", opts)).toEqual({ eligible: false, reason: "store_mismatch" });
  });
});

describe("重複防止キー", () => {
  it("同じ起点なら何度評価しても同じキー（再実行で重複しない）", () => {
    const a = evaluateRule(rule(), cust(), "2026-11-08", opts);
    const b = evaluateRule(rule(), cust(), "2026-11-15", opts);
    expect(a.eligible && b.eligible && a.periodKey === b.periodKey).toBe(true);
  });

  it("再来店すると起点が変わり、新しいキーになる", () => {
    const before = evaluateRule(rule(), cust(), "2026-11-08", opts);
    const after = evaluateRule(rule(), cust({ last_visit_on: "2026-11-09" }), "2026-11-16", opts);
    expect(before.eligible && after.eligible && before.periodKey !== after.periodKey).toBe(true);
  });

  it("ルール種別ごとに接頭辞が異なる", () => {
    expect(periodKey(rule({ rule_type: "days_since_first_visit" }), "2026-01-01")).toBe("fv:2026-01-01");
    expect(periodKey(rule({ rule_type: "no_confirmed_next_appointment" }), "2026-01-01")).toBe("na:2026-01-01");
  });
});

describe("isConditionResolved", () => {
  it("再来店で起点が変われば解消", () => {
    expect(isConditionResolved(rule(), "lv:2026-11-01", cust({ last_visit_on: "2026-11-09" }))).toBe(true);
  });
  it("起点が同じなら未解消（遡り期間外になっただけでは解消としない）", () => {
    expect(isConditionResolved(rule(), "lv:2026-11-01", cust())).toBe(false);
  });
  it("予約未確認ルールは予約が入れば解消", () => {
    const r = rule({ rule_type: "no_confirmed_next_appointment" });
    expect(isConditionResolved(r, "na:2026-11-01", cust({ next_appointment_at: "2026-11-20T01:00:00Z" }))).toBe(true);
  });
});

describe("resolveAssignee", () => {
  const ms = [
    { user_id: "u1", role: "staff" as const, store_id: "s1" },
    { user_id: "m1", role: "store_manager" as const, store_id: "s1" },
  ];
  it("顧客の担当スタッフが店舗に所属していれば担当", () => {
    expect(resolveAssignee(rule(), cust(), ms)).toBe("u1");
  });
  it("担当が所属していなければ店舗責任者", () => {
    expect(resolveAssignee(rule(), cust({ assigned_staff_id: "gone" }), ms)).toBe("m1");
  });
  it("店舗責任者が複数なら未割当", () => {
    const many = [...ms, { user_id: "m2", role: "store_manager" as const, store_id: "s1" }];
    expect(resolveAssignee(rule(), cust({ assigned_staff_id: null }), many)).toBeNull();
  });
  it("unassigned 戦略は常に未割当", () => {
    expect(resolveAssignee(rule({ assignee_strategy: "unassigned" }), cust(), ms)).toBeNull();
  });
});
