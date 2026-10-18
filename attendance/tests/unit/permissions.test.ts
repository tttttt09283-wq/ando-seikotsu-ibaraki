import { describe, expect, it } from "vitest";
import {
  canGrantRole,
  canManageClinic,
  grantableRoles,
  homePathFor,
  isHq,
  managedClinicIds,
  type Actor,
  type RoleGrant,
} from "@/lib/auth/permissions";

const actor = (roles: RoleGrant[]): Actor => ({ userId: "u1", email: "a@example.com", displayName: "A", roles });

describe("権限判定", () => {
  it("一般スタッフはどの院も運営できない", () => {
    const staff = actor([{ role: "staff", clinicId: null }]);
    expect(isHq(staff)).toBe(false);
    expect(canManageClinic(staff, "c1")).toBe(false);
    expect(grantableRoles(staff)).toEqual([]);
    expect(homePathFor(staff)).toBe("/me");
  });

  it("院長は担当院だけ運営できる（兼務は複数院）", () => {
    const manager = actor([
      { role: "clinic_manager", clinicId: "c1" },
      { role: "clinic_manager", clinicId: "c2" },
      { role: "clinic_manager", clinicId: "c1" },
    ]);
    expect(managedClinicIds(manager)).toEqual(["c1", "c2"]);
    expect(canManageClinic(manager, "c1")).toBe(true);
    expect(canManageClinic(manager, "c2")).toBe(true);
    expect(canManageClinic(manager, "c3")).toBe(false);
    expect(homePathFor(manager)).toBe("/manager");
  });

  it("本部事務は全院を運営でき、院長・スタッフのみ付与できる", () => {
    const hq = actor([{ role: "hq_admin", clinicId: null }]);
    expect(canManageClinic(hq, "any")).toBe(true);
    expect(canGrantRole(hq, "clinic_manager")).toBe(true);
    expect(canGrantRole(hq, "hq_admin")).toBe(false);
    expect(canGrantRole(hq, "super_admin")).toBe(false);
    expect(homePathFor(hq)).toBe("/hq");
  });

  it("システム管理者は全ロールを付与できる", () => {
    const admin = actor([{ role: "super_admin", clinicId: null }]);
    expect(isHq(admin)).toBe(true);
    expect(grantableRoles(admin)).toEqual(["super_admin", "hq_admin", "clinic_manager", "staff"]);
  });
});
