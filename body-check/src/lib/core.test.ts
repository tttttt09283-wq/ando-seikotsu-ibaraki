import { describe, expect, it } from "vitest";
import { judgeCore, secondsToPoints } from "./core";

describe("体幹チェック", () => {
  it("秒数を1〜4点にする（境目ちょうどは上の点）", () => {
    expect(secondsToPoints(0, [20, 40, 60])).toBe(1);
    expect(secondsToPoints(20, [20, 40, 60])).toBe(2);
    expect(secondsToPoints(59.9, [20, 40, 60])).toBe(3);
    expect(secondsToPoints(60, [20, 40, 60])).toBe(4);
  });
  it("全部満点なら100点・Sランク", () => {
    const r = judgeCore({ plank: { value: 90 }, side: { left: 50, right: 50 }, bridge: { left: 4, right: 4 }, seated: { value: 40 } })!;
    expect(r.score).toBe(100);
    expect(r.rank.id).toBe("S");
    expect(r.weak).toHaveLength(0);
  });
  it("左右がある項目は低い方の点数、左右差を指摘", () => {
    const r = judgeCore({ side: { left: 10, right: 40 } })!;
    expect(r.items[0].points).toBe(1);
    expect(r.items[0].asymmetry).toContain("左側");
    expect(r.score).toBe(25);
    expect(r.selfcare[0].title).toContain("サイドプランク");
  });
  it("スキップした項目は点数に入れない／全部スキップなら null", () => {
    expect(judgeCore({ plank: { skipped: true } })).toBeNull();
    const r = judgeCore({ plank: { skipped: true }, seated: { value: 25 } })!;
    expect(r.items).toHaveLength(1);
    expect(r.score).toBe(75);
  });
});
