import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/redirect";

describe("ログイン後の遷移先", () => {
  it("自サイト内のパスはそのまま", () => {
    expect(safeNextPath("/admin/staff")).toBe("/admin/staff");
  });

  it("外部URL・プロトコル相対URL・キオスク画面は / にする", () => {
    for (const value of ["https://evil.example.com", "//evil.example.com", "/\\evil.example.com", "/kiosk", null, undefined]) {
      expect(safeNextPath(value)).toBe("/");
    }
  });
});
