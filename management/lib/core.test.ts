import { describe, expect, test } from "vitest";
import { normalizeLoginId, isValidLoginId, toAuthEmail } from "./login-id";
import { generateInitialPassword, passwordProblem } from "./password";
import { homePathFor, describeRoles } from "./roles";
import { userSchema, globalRoleSchema, storeSchema } from "./validation";
import { jstToday, formatDate } from "./time";

describe("ログインID", () => {
  test("全角・大文字・空白を正規化し、@ando.jp を付ける（POSと同じ）", () => {
    expect(normalizeLoginId(" ＴａＮａｋａ ")).toBe("tanaka");
    expect(toAuthEmail("Tanaka")).toBe("tanaka@ando.jp");
    expect(toAuthEmail("boss@example.com")).toBe("boss@example.com");
  });
  test("形式の確認", () => {
    expect(isValidLoginId("tanaka01")).toBe(true);
    expect(isValidLoginId("ta")).toBe(false);
    expect(isValidLoginId("-tanaka")).toBe(false);
    expect(isValidLoginId("田中")).toBe(false);
  });
});

describe("初期PASS", () => {
  test("指定の長さで、英小文字・英大文字・数字を含み、紛らわしい文字を使わない", () => {
    for (let i = 0; i < 200; i++) {
      const pw = generateInitialPassword(10);
      expect(pw).toHaveLength(10);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).not.toMatch(/[0O1lI]/);
      expect(passwordProblem(pw)).toBeNull();
    }
  });
  test("本人が決めるPASSの条件", () => {
    expect(passwordProblem("abc12")).toMatch(/8文字以上/);
    expect(passwordProblem("abcdefgh")).toMatch(/英字と数字/);
    expect(passwordProblem("abcd1234")).toBeNull();
  });
});

describe("役職ごとの最初の画面", () => {
  const base = { global_roles: [], stores: [] };
  test("社長＞GM＞BM＞院長＞スタッフ", () => {
    expect(homePathFor({ ...base, global_roles: [{ role: "PRESIDENT", area_id: null, area: null }] })).toBe("/president");
    expect(homePathFor({ ...base, global_roles: [{ role: "BM", area_id: "a", area: "南" }] })).toBe("/area");
    expect(homePathFor({ global_roles: [], stores: [{ store_id: "s1", store: "茨木院", role: "STAFF", is_primary: false }, { store_id: "s2", store: "交野院", role: "MANAGER", is_primary: true }] })).toBe("/store/s2");
    expect(homePathFor({ global_roles: [], stores: [{ store_id: "s1", store: "茨木院", role: "PART_TIMER", is_primary: true }] })).toBe("/me");
  });
  test("役職の表示", () => {
    expect(describeRoles({ global_roles: [{ role: "BM", area_id: "a", area: "南エリア" }], stores: [{ store_id: "s", store: "交野院", role: "MANAGER", is_primary: true }] })).toBe("BM（南エリア）／交野院 院長");
  });
});

describe("入力の確認", () => {
  test("スタッフ登録", () => {
    const ok = userSchema.safeParse({ staff_code: "A001", login_id: "Ｔａｎａｋａ", name: " 田中 ", employment_type: "正社員", hire_date: "2026-04-01", pos_staff_id: "" });
    expect(ok.success && ok.data).toMatchObject({ login_id: "tanaka", name: "田中", hire_date: "2026-04-01", pos_staff_id: null });
    expect(userSchema.safeParse({ staff_code: "A001", login_id: "x", name: "田中", employment_type: "正社員" }).success).toBe(false);
    expect(userSchema.safeParse({ staff_code: "A001", login_id: "tanaka", name: "田中", employment_type: "社長" }).success).toBe(false);
  });
  test("BMにはエリアが必要、社長・GMには不要", () => {
    expect(globalRoleSchema.safeParse({ role: "BM", area_id: "", starts_on: "2026-11-01" }).success).toBe(false);
    expect(globalRoleSchema.safeParse({ role: "GM", area_id: "", starts_on: "2026-11-01" }).success).toBe(true);
  });
  test("店舗コードは大文字に揃える", () => {
    const r = storeSchema.safeParse({ code: "korien", name: "香里園院", display_order: "7" });
    expect(r.success && r.data.code).toBe("KORIEN");
  });
});

describe("日本時間", () => {
  test("UTC 15:00 は日本時間の翌日", () => {
    expect(jstToday(new Date("2026-11-05T15:00:00Z"))).toBe("2026-11-06");
    expect(jstToday(new Date("2026-11-05T14:59:59Z"))).toBe("2026-11-05");
  });
  test("日付の表示", () => {
    expect(formatDate("2026-11-08")).toBe("2026年11月8日（日）");
  });
});

import { remainingLabel, meetingStatusLabel, isTaskOverdue, cleanDecisions } from "./meetings";
describe("会議・タスクの表示", () => {
  // 2026-11-05 開催 → 期限 2026-11-08 23:59:59 JST（= 14:59:59Z）
  const due = "2026-11-08T14:59:59Z";
  test("残り時間", () => {
    expect(remainingLabel(due, new Date("2026-11-06T00:00:00+09:00"))).toBe("残り3日0時間");
    expect(remainingLabel(due, new Date("2026-11-08T23:15:00+09:00"))).toBe("残り45分");
    expect(remainingLabel(due, new Date("2026-11-09T12:00:00+09:00"))).toBe("12時間0分超過");
  });
  test("状態の表示", () => {
    expect(meetingStatusLabel("submitted", true)).toBe("提出済み（期限超過）");
    expect(meetingStatusLabel("overdue", false)).toBe("期限超過");
  });
  test("期限切れのタスク", () => {
    expect(isTaskOverdue("2026-11-08", "doing", "2026-11-09")).toBe(true);
    expect(isTaskOverdue("2026-11-08", "done", "2026-11-09")).toBe(false);
    expect(isTaskOverdue(null, "todo", "2026-11-09")).toBe(false);
  });
  test("空の決定事項の行は送らない", () => {
    expect(cleanDecisions([{ id: null, title: " ", detail: "", owner_user_id: "", due_date: "" }, { id: null, title: " POP ", detail: "", owner_user_id: "", due_date: "" }]))
      .toEqual([{ id: null, title: "POP", detail: "", owner_user_id: "", due_date: "" }]);
  });
});

import { lineDiff, parseBody, appliesLabel, effectiveLabel } from "./rules";
describe("社内規定の表示", () => {
  test("行の差分", () => {
    expect(lineDiff("a\nb\nc", "a\nB\nc\nd").map((d) => `${d.kind}:${d.text}`)).toEqual(["same:a", "del:b", "add:B", "same:c", "add:d"]);
    expect(lineDiff("x", "x")).toEqual([{ kind: "same", text: "x" }]);
  });
  test("本文の見出し・箇条書き・段落", () => {
    expect(parseBody("## 目的\n記録を残す。\n続き\n\n- A\n- B\n1. 一\n2. 二")).toEqual([
      { type: "h", text: "目的" }, { type: "p", text: "記録を残す。\n続き" }, { type: "ul", items: ["A", "B"] }, { type: "ol", items: ["一", "二"] },
    ]);
  });
  test("適用対象と施行の表示", () => {
    expect(appliesLabel({})).toBe("全員");
    expect(appliesLabel({ roles: ["MANAGER"], employment_types: ["アルバイト"] })).toBe("役職：院長／雇用区分：アルバイト");
    expect(effectiveLabel("2026-01-01", true, "2026-11-11")).toBe("初期案・労務確認中（施行前）");
    expect(effectiveLabel("2026-01-01", false, "2026-11-11")).toBe("施行中");
    expect(effectiveLabel("2027-01-01", false, "2026-11-11")).toBe("施行前");
  });
});

import { rate, rateTone, totalRow, monthOf, shiftMonth, type KpiRow } from "./kpi";
describe("ダッシュボードの KPI", () => {
  test("率と色分け（色だけに頼らず数値も出す）", () => {
    expect(rate(2, 3)).toBe(66.7);
    expect(rate(0, 0)).toBeNull();
    expect([rateTone(95), rateTone(75), rateTone(10), rateTone(null)]).toEqual(["ok", "warn", "bad", "none"]);
  });
  test("合計は件数を足し、率は合計から出す", () => {
    const base = { store_id: "a", store_name: "A", display_order: 1, staff_count: 3, meetings_held: 2, minutes_submitted: 1, minutes_on_time: 1, minutes_overdue_now: 1,
      decisions_due: 0, decisions_done: 0, parttime_total: 1, parttime_help: 0, parttime_exception: 0, president_pending: 0, shortage_requests: 0,
      paid_granted: "10.00", paid_taken: "2.00", five_day_risk: 1, shift_remaining: "1.0", shift_expired: "0", rule_unack: 2 } as KpiRow;
    const t = totalRow([base, { ...base, store_id: "b", meetings_held: 2, minutes_submitted: 2 }]);
    expect([t.meetings_held, t.minutes_submitted, t.paid_granted, t.rule_unack]).toEqual([4, 3, 20, 4]);
    expect(rate(t.minutes_submitted, t.meetings_held)).toBe(75);
  });
  test("月の指定", () => {
    expect(monthOf("2026-13", "2026-11-09")).toBe("2026-11");
    expect(monthOf("2026-10", "2026-11-09")).toBe("2026-10");
    expect([shiftMonth("2026-01", -1), shiftMonth("2026-12", 1)]).toEqual(["2025-12", "2027-01"]);
  });
});
