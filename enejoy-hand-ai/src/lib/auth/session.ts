/**
 * ログインセッション（署名付きCookie）。
 * operator = AI部門 統括責任者（指示・承認・代表へのエスカレーション）
 * president = 代表取締役（自分宛ての承認依頼の判断のみ）
 * proxy.ts と API の両方で使うため、Node 固有APIではなく Web Crypto を使う。
 */

export const SESSION_COOKIE = "eh_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12時間

/** パスコード未設定（デモ専用運用）のときだけ使う固定鍵。本番データは扱わない前提。 */
const DEMO_ONLY_SECRET = "enejoy-hand-ai-demo-only-secret-do-not-use-in-production";

export type SessionRole = "operator" | "president";

export type SessionPayload = {
  sub: SessionRole;
  /** demo = パスコードなしのデモ入場 / passcode = パスコード認証 */
  via: "demo" | "passcode";
  iat: number;
  exp: number;
};

export type AuthConfig =
  | {
      ok: true;
      secret: string;
      /** true = パスコード認証が必須（デモ入場は不可） */
      passcodeRequired: boolean;
      /** 役割ごとのパスコード（未設定の役割はパスコードでログインできない） */
      passcodes: Partial<Record<SessionRole, string>>;
    }
  | { ok: false; error: string };

export function getAuthConfig(env: Record<string, string | undefined> = process.env): AuthConfig {
  const operator = env.OPERATOR_PASSCODE;
  const president = env.PRESIDENT_PASSCODE;
  const secret = env.SESSION_SECRET;
  if (operator || president) {
    if (!operator) return { ok: false, error: "PRESIDENT_PASSCODE を使う場合は OPERATOR_PASSCODE も設定してください。" };
    if (!secret || secret.length < 32) {
      return { ok: false, error: "パスコードを使う場合は SESSION_SECRET（32文字以上）を設定してください。" };
    }
    if (president && president === operator) {
      return { ok: false, error: "OPERATOR_PASSCODE と PRESIDENT_PASSCODE には別の値を設定してください。" };
    }
    return { ok: true, secret, passcodeRequired: true, passcodes: { operator, president } };
  }
  return {
    ok: true,
    secret: secret && secret.length >= 32 ? secret : DEMO_ONLY_SECRET,
    passcodeRequired: false,
    passcodes: {},
  };
}

/** 署名が正しくても、今の設定で有効なセッションか（パスコード必須ならデモ入場は無効） */
export function isSessionAllowed(session: SessionPayload | null, cfg: AuthConfig): session is SessionPayload {
  if (!session || !cfg.ok) return false;
  return !cfg.passcodeRequired || session.via === "passcode";
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifySession(
  token: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const sigBytes = fromBase64Url(sig);
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      sigBytes as Uint8Array<ArrayBuffer>,
      encoder.encode(body),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload;
    if ((payload.sub !== "operator" && payload.sub !== "president") || typeof payload.exp !== "number" || payload.exp <= nowSeconds) return null;
    return payload;
  } catch {
    return null;
  }
}

export function newSessionPayload(
  role: SessionRole,
  via: SessionPayload["via"],
  nowSeconds = Math.floor(Date.now() / 1000),
): SessionPayload {
  return { sub: role, via, iat: nowSeconds, exp: nowSeconds + SESSION_TTL_SECONDS };
}

/** タイミング攻撃を避けた文字列比較 */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
