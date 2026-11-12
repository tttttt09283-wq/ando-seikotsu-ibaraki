/**
 * LINE Webhook の署名検証。
 * x-line-signature = base64( HMAC-SHA256(channelSecret, 受信した生のリクエストボディ) )
 * 必ず JSON.parse する前の「生のボディ」で検証し、比較は定数時間で行う。
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function computeLineSignature(channelSecret: string, rawBody: string | Buffer): string {
  return createHmac("sha256", channelSecret).update(rawBody).digest("base64");
}

export function verifyLineSignature(channelSecret: string, rawBody: string | Buffer, signature: string | null | undefined): boolean {
  if (!channelSecret || !signature) return false;
  const expected = Buffer.from(computeLineSignature(channelSecret, rawBody), "base64");
  let given: Buffer;
  try {
    given = Buffer.from(signature, "base64");
  } catch {
    return false;
  }
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}
