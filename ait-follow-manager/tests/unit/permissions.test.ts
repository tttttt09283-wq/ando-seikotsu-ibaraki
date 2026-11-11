import { describe, expect, it } from "vitest";
import { can, highestRole, PERMISSIONS, type Permission, type Role } from "@/lib/auth/permissions";

const S1 = "store-1";
const S2 = "store-2";
const asRole = (role: Role, store: string | null = role === "org_admin" ? null : S1) => [{ role, store_id: store }];

describe("権限マトリクス（docs/05 と一致）", () => {
  const perms = Object.keys(PERMISSIONS) as Permission[];

  it.each(perms)("%s：org スコープは全店舗、store スコープは所属店舗のみ、none は不可", (perm) => {
    for (const role of ["org_admin", "store_manager", "staff"] as Role[]) {
      const scope = PERMISSIONS[perm][role];
      const ms = asRole(role);
      expect(can(ms, perm, S1)).toBe(scope !== "none");
      expect(can(ms, perm, S2)).toBe(scope === "org");
      expect(can(ms, perm, null)).toBe(scope === "org");
    }
  });

  it("Staff は顧客削除・エクスポート・ルール編集・監査ログ閲覧ができない", () => {
    const staff = asRole("staff");
    for (const p of ["customer.delete", "customer.export", "rule.manage", "audit.view", "staff.invite", "analytics.view"] as Permission[]) {
      expect(can(staff, p, S1)).toBe(false);
    }
  });

  it("Store Manager は他店舗の顧客を扱えない", () => {
    const mgr = asRole("store_manager");
    expect(can(mgr, "customer.write", S1)).toBe(true);
    expect(can(mgr, "customer.write", S2)).toBe(false);
  });

  it("複数店舗所属：店舗ごとのロールで判定する", () => {
    const ms = [
      { role: "staff" as const, store_id: S1 },
      { role: "store_manager" as const, store_id: S2 },
    ];
    expect(can(ms, "rule.manage", S1)).toBe(false);
    expect(can(ms, "rule.manage", S2)).toBe(true);
    expect(highestRole(ms)).toBe("store_manager");
  });

  it("所属が無ければ何もできない", () => {
    expect(can([], "customer.read", S1)).toBe(false);
    expect(highestRole([])).toBeNull();
  });
});
