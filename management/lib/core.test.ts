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
