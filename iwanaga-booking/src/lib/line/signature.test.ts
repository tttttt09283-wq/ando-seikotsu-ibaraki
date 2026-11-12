import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { computeLineSignature, verifyLineSignature } from "./signature";
import { parseLineMessage, buildLinePrefill } from "../domain/messages";

describe("LINE 署名検証", () => {
  const secret = "channel-secret";
  const body = '{"destination":"Uxxx","events":[]}';
  it("HMAC-SHA256(base64) と一致すれば有効", () => {
    const sig = createHmac("sha256", secret).update(body).digest("base64");
    expect(computeLineSignature(secret, body)).toBe(sig);
    expect(verifyLineSignature(secret, body, sig)).toBe(true);
  });
  it("ボディが1文字でも違えば無効", () => {
    const sig = computeLineSignature(secret, body);
    expect(verifyLineSignature(secret, body + " ", sig)).toBe(false);
    expect(verifyLineSignature("other", body, sig)).toBe(false);
    expect(verifyLineSignature(secret, body, "")).toBe(false);
    expect(verifyLineSignature(secret, body, null)).toBe(false);
    expect(verifyLineSignature("", body, sig)).toBe(false);
  });
  it("日本語を含むボディ（UTF-8）でも検証できる", () => {
    const b = '{"events":[{"message":{"text":"予約番号：IW-ABCDEF"}}]}';
    expect(verifyLineSignature(secret, b, computeLineSignature(secret, Buffer.from(b, "utf8")))).toBe(true);
  });
});

describe("LINE メッセージの照合用パース", () => {
  it("フォームが作った文面から予約番号と確認コードを取り出す", () => {
    const t = buildLinePrefill({ code: "IW-ABC234", verifyCode: "012345", locationName: "x", when: "y", menu: "z" });
    expect(parseLineMessage(t)).toEqual({ code: "IW-ABC234", verifyCode: "012345" });
  });
  it("全角数字の確認コードも受け付ける・どちらか欠けていれば null", () => {
    expect(parseLineMessage("予約番号: IW-ABC234\n確認コード: ０１２３４５")).toEqual({ code: "IW-ABC234", verifyCode: "012345" });
    expect(parseLineMessage("予約番号：IW-ABC234")).toBeNull();
    expect(parseLineMessage("確認コード：012345")).toBeNull();
    expect(parseLineMessage("予約番号：IW-ABC0O1\n確認コード：012345")).toBeNull(); // 使わない文字
  });
});
