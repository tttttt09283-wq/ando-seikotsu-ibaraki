import { describe, expect, it } from "vitest";
import { getAuthConfig, isSessionAllowed, newSessionPayload, safeEqual, signSession, verifySession } from "./session";

const SECRET = "x".repeat(40);

describe("session", () => {
  it("signs and verifies a session for each role", async () => {
    const op = await signSession(newSessionPayload("operator", "passcode", 1000), SECRET);
    expect(await verifySession(op, SECRET, 1001)).toMatchObject({ sub: "operator", via: "passcode" });
    const pres = await signSession(newSessionPayload("president", "demo", 1000), SECRET);
    expect(await verifySession(pres, SECRET, 1001)).toMatchObject({ sub: "president", via: "demo" });
  });

  it("rejects tampered, wrong-secret, unknown-role and expired tokens", async () => {
    const token = await signSession(newSessionPayload("president", "demo", 1000), SECRET);
    const [body, sig] = token.split(".");
    // 代表のトークンの署名を流用して統括責任者になりすますことはできない
    const forged = Buffer.from(JSON.stringify({ sub: "operator", via: "passcode", iat: 1000, exp: 9e9 })).toString("base64url");
    expect(await verifySession(`${forged}.${sig}`, SECRET, 1001)).toBeNull();
    expect(await verifySession(`${body}.${sig}`, "y".repeat(40), 1001)).toBeNull();
    expect(await verifySession(token, SECRET, 1000 + 60 * 60 * 13)).toBeNull();
    const ceo = await signSession({ sub: "ceo" as never, via: "passcode", iat: 1000, exp: 9e9 }, SECRET);
    expect(await verifySession(ceo, SECRET, 1001)).toBeNull();
    expect(await verifySession("garbage", SECRET)).toBeNull();
    expect(await verifySession(undefined, SECRET)).toBeNull();
  });

  it("requires a strong SESSION_SECRET and distinct passcodes", () => {
    expect(getAuthConfig({ OPERATOR_PASSCODE: "abc" }).ok).toBe(false);
    expect(getAuthConfig({ PRESIDENT_PASSCODE: "abc", SESSION_SECRET: SECRET }).ok).toBe(false);
    expect(getAuthConfig({ OPERATOR_PASSCODE: "same", PRESIDENT_PASSCODE: "same", SESSION_SECRET: SECRET }).ok).toBe(false);
    expect(getAuthConfig({ OPERATOR_PASSCODE: "abc", SESSION_SECRET: SECRET })).toMatchObject({
      ok: true,
      passcodeRequired: true,
      passcodes: { operator: "abc" },
    });
    expect(getAuthConfig({})).toMatchObject({ ok: true, passcodeRequired: false });
  });

  it("disallows demo sessions once passcodes are configured", () => {
    const live = getAuthConfig({ OPERATOR_PASSCODE: "abc", SESSION_SECRET: SECRET });
    expect(isSessionAllowed(newSessionPayload("operator", "demo"), live)).toBe(false);
    expect(isSessionAllowed(newSessionPayload("operator", "passcode"), live)).toBe(true);
    expect(isSessionAllowed(newSessionPayload("president", "demo"), getAuthConfig({}))).toBe(true);
  });

  it("compares passcodes", async () => {
    expect(await safeEqual("abc", "abc")).toBe(true);
    expect(await safeEqual("abc", "abd")).toBe(false);
  });
});
