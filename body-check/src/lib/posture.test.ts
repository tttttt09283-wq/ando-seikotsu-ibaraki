import { describe, expect, it } from "vitest";
import { computeFrontAnalysis, computeSideAnalysis, type Landmark } from "./posture";

/** 正面・気をつけの体（0〜1の比率） */
function body(over: Record<number, [number, number]> = {}): Landmark[] {
  const base: Record<number, [number, number]> = {
    0: [0.5, 0.12], 2: [0.52, 0.11], 5: [0.48, 0.11], 7: [0.53, 0.12], 8: [0.47, 0.12],
    11: [0.6, 0.25], 12: [0.4, 0.25], 23: [0.57, 0.52], 24: [0.43, 0.52], 25: [0.56, 0.72], 26: [0.44, 0.72], 27: [0.55, 0.92], 28: [0.45, 0.92],
  };
  return Array.from({ length: 33 }, (_, i) => {
    const p = over[i] ?? base[i] ?? [0.5, 0.5];
    return { x: p[0], y: p[1], visibility: 0.9 };
  });
}

describe("AI姿勢チェック", () => {
  it("正面：左右がそろっていれば100点・良好", () => {
    const r = computeFrontAnalysis(body());
    expect(r.score).toBe(100);
    expect(r.findings.every((f) => f.ok)).toBe(true);
  });
  it("正面：右肩が下がっていると減点し、所見を出す", () => {
    const r = computeFrontAnalysis(body({ 12: [0.4, 0.27] }));
    expect(r.score).toBeLessThan(100);
    expect(r.findings.find((f) => f.part.startsWith("肩"))?.ok).toBe(false);
  });
  it("横向き：頭が大きく前に出ていると頭部前方位の所見", () => {
    // 左側面：鼻が耳より前（x大きい）＝右向き。耳を足首より前へ
    const r = computeSideAnalysis(body({ 0: [0.62, 0.12], 7: [0.6, 0.13], 11: [0.53, 0.25], 23: [0.55, 0.52], 25: [0.55, 0.72], 27: [0.55, 0.92] }));
    expect(r.findings[0].ok).toBe(false);
    expect(r.score).toBeLessThan(90);
  });
});
