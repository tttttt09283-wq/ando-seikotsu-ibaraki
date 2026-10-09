import { describe, expect, it } from "vitest";
import { validateStatsEvent } from "./stats";
import { createInitialState, sanitizeState } from "./storage";
import { readBookingUrl } from "@/config/site";

const validComplete = {
  type: "complete",
  sessionId: "18e809a8-eb5a-434c-9248-bce8b0766b86",
  ageGroup: "40s",
  symptoms: ["low_back", "posture"],
  scores: { balance: 12, legs: null, flexibility: 8, shoulder: 20, condition: 10 },
  total: 63,
  rank: "B",
};

describe("validateStatsEvent（統計データの検証）", () => {
  it("正しいデータは受け付ける", () => {
    expect(validateStatsEvent(validComplete)).not.toBeNull();
    expect(validateStatsEvent({ type: "booking_click", sessionId: validComplete.sessionId })).toEqual({
      type: "booking_click",
      sessionId: validComplete.sessionId,
    });
  });
  it("余計な項目（個人情報など）は保存対象から除外される", () => {
    const r = validateStatsEvent({ ...validComplete, name: "山田太郎", phone: "090" });
    expect(r).not.toHaveProperty("name");
    expect(r).not.toHaveProperty("phone");
  });
  it("不正な値は拒否する", () => {
    expect(validateStatsEvent(null)).toBeNull();
    expect(validateStatsEvent({ ...validComplete, sessionId: "x" })).toBeNull();
    expect(validateStatsEvent({ ...validComplete, ageGroup: "90s" })).toBeNull();
    expect(validateStatsEvent({ ...validComplete, symptoms: ["unknown"] })).toBeNull();
    expect(validateStatsEvent({ ...validComplete, total: 101 })).toBeNull();
    expect(validateStatsEvent({ ...validComplete, rank: "Z" })).toBeNull();
    expect(validateStatsEvent({ ...validComplete, scores: { ...validComplete.scores, legs: 25 } })).toBeNull();
  });
});

describe("sanitizeState（ブラウザ内保存データの確認）", () => {
  it("正しいデータはそのまま読み込める", () => {
    const s = createInitialState();
    expect(sanitizeState(JSON.parse(JSON.stringify(s)))?.sessionId).toBe(s.sessionId);
  });
  it("壊れたデータは破棄する", () => {
    expect(sanitizeState("abc")).toBeNull();
    expect(sanitizeState({ foo: 1 })).toBeNull();
  });
  it("24時間を過ぎた途中データは破棄する", () => {
    const s = { ...createInitialState(), updatedAt: new Date(Date.now() - 25 * 3600 * 1000).toISOString() };
    expect(sanitizeState(s)).toBeNull();
  });
  it("結果は7日間保持する", () => {
    const old = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    const s = { ...createInitialState(), completedAt: old, updatedAt: old };
    expect(sanitizeState(s)).not.toBeNull();
  });
  it("不正な回答・年代は取り除く", () => {
    const s = {
      ...createInitialState(),
      profile: { ageGroup: "999", symptoms: ["low_back", "evil"] },
      answers: { legs: { status: "answered", value: 10 }, hack: { status: "skipped" }, balance: "bad" },
    };
    const r = sanitizeState(s)!;
    expect(r.profile).toEqual({ ageGroup: null, symptoms: ["low_back"] });
    expect(Object.keys(r.answers)).toEqual(["legs"]);
  });
});

describe("readBookingUrl（予約URLの設定）", () => {
  it("未設定・空・不正な値は null（ボタン無効）", () => {
    expect(readBookingUrl(undefined)).toBeNull();
    expect(readBookingUrl("  ")).toBeNull();
    expect(readBookingUrl("not a url")).toBeNull();
    expect(readBookingUrl("http://example.com")).toBeNull();
    expect(readBookingUrl("javascript:alert(1)")).toBeNull();
  });
  it("https のURLは使える", () => {
    expect(readBookingUrl("https://example.com/booking")).toBe("https://example.com/booking");
  });
});
