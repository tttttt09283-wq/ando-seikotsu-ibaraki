import { describe, expect, it } from "vitest";
import { getAuthConfig, newSessionPayload, safeEqual, signSession, verifySession } from "./session";

const SECRET = "x".repeat(40);

describe("session", () => {
  it("signs and verifies a session", async () => {
    const token = await signSession(newSessionPayload("passcode", 1000), SECRET);
    expect(await verifySession(token, SECRET, 1001)).toMatchObject({ sub: "ceo", via: "passcode" });
  });
  it("rejects tampered, wrong-secret and expired tokens", async () => {
    const token = await signSession(newSessionPayload("demo", 1000), SECRET);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "ceo", via: "passcode", iat: 1000, exp: 9e9 })).toString("base64url");
    expect(await verifySession(`${forged}.${sig}`, SECRET, 1001)).toBeNull();
    expect(await verifySession(`${body}.${sig}`, "y".repeat(40), 1001)).toBeNull();
    expect(await verifySession(token, SECRET, 1000 + 60 * 60 * 13)).toBeNull();
    expect(await verifySession("garbage", SECRET)).toBeNull();
    expect(await verifySession(undefined, SECRET)).toBeNull();
  });
  it("requires a strong SESSION_SECRET when a passcode is configured", () => {
    expect(getAuthConfig({ CEO_PASSCODE: "abc" }).ok).toBe(false);
    expect(getAuthConfig({ CEO_PASSCODE: "abc", SESSION_SECRET: SECRET })).toMatchObject({ ok: true, passcodeRequired: true });
    expect(getAuthConfig({})).toMatchObject({ ok: true, passcodeRequired: false });
  });
  it("compares passcodes", async () => {
    expect(await safeEqual("abc", "abc")).toBe(true);
    expect(await safeEqual("abc", "abd")).toBe(false);
  });
});
