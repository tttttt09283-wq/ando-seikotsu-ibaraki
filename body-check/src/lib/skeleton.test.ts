import { describe, expect, it } from "vitest";
import { judgeSkeleton } from "./skeleton";

describe("骨格タイプチェック", () => {
  it("多いタイプを判定し、割合を出す", () => {
    const r = judgeSkeleton({ a: "W", b: "W", c: "W", d: "W", e: "W", f: "W", g: "S", h: "S", i: "N", j: "N" });
    expect(r.main).toBe("W");
    expect(r.sub).toBeNull();
    expect(r.pct.W).toBe(60);
  });
  it("1位と2位の差が1問以内ならミックス", () => {
    const r = judgeSkeleton({ a: "S", b: "S", c: "S", d: "S", e: "N", f: "N", g: "N", h: "W", i: "W", j: "W" });
    expect(r.label).toContain("ミックス");
  });
});
