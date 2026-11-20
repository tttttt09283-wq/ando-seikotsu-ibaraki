import { describe, expect, it } from "vitest";
import { signSession, verifySession, safeEqualString } from "./session";
import { assertPermission, AuthorizationError, hasPermission } from "./permissions";
import { OWNER, STAFF_PRIVATE_ONLY } from "@/test/fixtures";

const SECRET = "x".repeat(40);

describe("管理者セッション（ローカル代替モード）", () => {
  it("署名したセッションだけ有効", () => {
    const t = signSession({ sub: "local-owner", exp: 2_000_000_000 }, SECRET);
    expect(verifySession(t, SECRET, 1_900_000_000)?.sub).toBe("local-owner");
  });
  it("改ざん・別の秘密鍵・期限切れ・空は無効", () => {
    const t = signSession({ sub: "local-owner", exp: 2_000_000_000 }, SECRET);
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "local-owner", exp: 9_999_999_999 })).toString("base64url");
    expect(verifySession(`${forged}.${sig}`, SECRET, 1_900_000_000)).toBeNull();
    expect(verifySession(`${body}.${sig}x`, SECRET, 1_900_000_000)).toBeNull();
    expect(verifySession(t, "y".repeat(40), 1_900_000_000)).toBeNull();
    expect(verifySession(t, SECRET, 2_000_000_001)).toBeNull();
    expect(verifySession("", SECRET)).toBeNull();
    expect(verifySession(undefined, SECRET)).toBeNull();
    expect(verifySession("abc", SECRET)).toBeNull();
  });
  it("パスワード比較は定数時間", () => {
    expect(safeEqualString("abc", "abc")).toBe(true);
    expect(safeEqualString("abc", "abd")).toBe(false);
    expect(safeEqualString("abc", "abcd")).toBe(false);
  });
});

describe("管理者の権限", () => {
  it("未ログインは拒否", () => {
    expect(() => assertPermission(null, "view")).toThrow(AuthorizationError);
  });
  it("オーナーはすべて可能", () => {
    for (const p of ["view", "operate", "settings", "approve_gates", "audit", "export"] as const) expect(hasPermission(OWNER, p, "enejoy_hand")).toBe(true);
  });
  it("スタッフは設定変更・承認フラグ・監査ログ不可。CSV は can_export のときだけ", () => {
    expect(hasPermission(STAFF_PRIVATE_ONLY, "operate", "iwanaga_private")).toBe(true);
    expect(hasPermission(STAFF_PRIVATE_ONLY, "settings")).toBe(false);
    expect(hasPermission(STAFF_PRIVATE_ONLY, "approve_gates")).toBe(false);
    expect(hasPermission(STAFF_PRIVATE_ONLY, "audit")).toBe(false);
    expect(hasPermission(STAFF_PRIVATE_ONLY, "export")).toBe(false);
    expect(hasPermission({ ...STAFF_PRIVATE_ONLY, can_export: true }, "export", "iwanaga_private")).toBe(true);
    expect(hasPermission({ ...OWNER, can_export: false }, "export")).toBe(false);
  });
  it("許可されていない管理主体（勤務先）のデータには触れない", () => {
    expect(hasPermission(STAFF_PRIVATE_ONLY, "view", "enejoy_hand")).toBe(false);
    expect(() => assertPermission(STAFF_PRIVATE_ONLY, "view", "enejoy_hand")).toThrow(AuthorizationError);
  });
});
