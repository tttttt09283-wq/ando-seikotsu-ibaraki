/**
 * ローカル代替モード用の管理者セッション（HMAC 署名付き Cookie）。
 * 本番（Supabase Auth 設定時）は使わない。
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const LOCAL_SESSION_COOKIE = "iw_admin_local";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface LocalSessionPayload {
  sub: string;
  exp: number; // unix 秒
}

export function signSession(payload: LocalSessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySession(token: string | undefined | null, secret: string, nowSec = Math.floor(Date.now() / 1000)): LocalSessionPayload | null {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  let given: Buffer;
  try {
    given = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as LocalSessionPayload;
    if (typeof p.exp !== "number" || p.exp < nowSec || typeof p.sub !== "string") return null;
    return p;
  } catch {
    return null;
  }
}

export function safeEqualString(a: string, b: string): boolean {
  const ha = createHmac("sha256", "cmp").update(a).digest();
  const hb = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(ha, hb);
}
