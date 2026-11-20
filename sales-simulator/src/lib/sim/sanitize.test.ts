import { describe, expect, it } from "vitest";
import { DEFAULT_INPUT } from "./defaults";
import { nonNegativeInt, percent, sanitizeInput, toSafeNumber } from "./sanitize";
import { createInitialState, parseStoredState, serializeState } from "./scenarios";

describe("入力の安全化", () => {
  it("空欄・文字・NaN は 0", () => {
    expect(toSafeNumber("")).toBe(0);
    expect(toSafeNumber("abc")).toBe(0);
    expect(toSafeNumber(Number.NaN)).toBe(0);
    expect(toSafeNumber(undefined)).toBe(0);
  });

  it("カンマ・全角数字・単位を含む文字列を読める", () => {
    expect(toSafeNumber("4,000,000")).toBe(4_000_000);
    expect(toSafeNumber("１２３")).toBe(123);
    expect(toSafeNumber("500円")).toBe(500);
  });

  it("マイナスは 0", () => {
    expect(nonNegativeInt(-50)).toBe(0);
    expect(nonNegativeInt("-1")).toBe(0);
  });

  it("率は 0〜100% に制限", () => {
    expect(percent(150)).toBe(100);
    expect(percent(-5)).toBe(0);
    expect(percent(33.333)).toBe(33.3);
  });

  it("壊れたデータは初期値で補う", () => {
    const s = sanitizeInput({ basic: { karteCount: "120" }, acu: { rate: 999 } }, DEFAULT_INPUT);
    expect(s.basic.karteCount).toBe(120);
    expect(s.basic.visitsPerKarte).toBe(5);
    expect(s.acu.rate).toBe(100);
    expect(s.self.emsPrice).toBe(2000);
  });
});

describe("保存データ", () => {
  it("保存→復元で同じ状態になる", () => {
    const state = createInitialState();
    state.active = "improve";
    state.scenarios.improve.input.basic.karteCount = 150;
    state.scenarios.improve.savedAt = "2026-01-01T00:00:00.000Z";
    expect(parseStoredState(serializeState(state))).toEqual(state);
  });

  it("壊れたJSONでも初期状態を返す", () => {
    expect(parseStoredState("{broken")).toEqual(createInitialState());
    expect(parseStoredState(null)).toEqual(createInitialState());
    expect(parseStoredState("null")).toEqual(createInitialState());
  });
});
