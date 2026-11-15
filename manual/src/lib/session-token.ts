import crypto from "node:crypto";

// ログインの印（クッキーに入れる）。中身は改ざんできないように HMAC で署名する
export type SessionData = {
  m: string; // mn_members.id
  via: "email" | "pin" | "dev";
  k?: string; // 院ID＋個人PASSの人：台帳の氏名キー
  h?: string; // 院ID＋個人PASSの人：PASSから作った印（再発行で古いログインを無効にする）
  exp: number;
};

export const SESSION_HOURS = 12;

function secret(): string {
  const s = process.env.MANUAL_SESSION_SECRET || process.env.PIN_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("サーバー側に MANUAL_SESSION_SECRET（32文字以上）が設定されていません");
  return s;
}

const sign = (body: string) => crypto.createHmac("sha256", secret()).update(`mn:${body}`).digest("base64url");

export function encodeSession(data: Omit<SessionData, "exp">, hours = SESSION_HOURS, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...data, exp: now + hours * 3600 * 1000 })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeSession(token: string | undefined | null, now = Date.now()): SessionData | null {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const d = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionData;
    if (typeof d.m !== "string" || typeof d.exp !== "number" || d.exp <= now) return null;
    if (!["email", "pin", "dev"].includes(d.via)) return null;
    return d;
  } catch {
    return null;
  }
}
