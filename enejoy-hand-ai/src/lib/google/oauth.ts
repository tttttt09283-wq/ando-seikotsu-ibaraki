import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveDataDir } from "@/lib/store/store";

/**
 * Googleアカウントとの接続（OAuth 2.0）。
 * Googleビジネスプロフィールはお店の持ち主のGoogleアカウントでの承認が必要なため、
 * 「Googleアカウントで接続」→ 同意 → このアプリが更新用トークンを保存する、という流れにする。
 * トークンは会社データとは別のファイル（所有者のみ読み書き可）に保存し、画面には出さない。
 */

/** 同意画面へ移る前に発行する、なりすまし防止の合言葉（state）を入れる Cookie */
export const OAUTH_STATE_COOKIE = "eh_google_state";

export const GBP_SCOPE = "https://www.googleapis.com/auth/business.manage";
const SCOPES = [GBP_SCOPE, "openid", "email"];

export type OAuthConfig = { clientId: string; clientSecret: string; redirectUri: string };

export function getOAuthConfig(origin?: string): OAuthConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const base = process.env.GOOGLE_OAUTH_REDIRECT_BASE || origin || "http://localhost:3001";
  return { clientId, clientSecret, redirectUri: `${base.replace(/\/$/, "")}/api/google/callback` };
}

export function buildAuthUrl(cfg: OAuthConfig, state: string): string {
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type StoredToken = { refresh_token: string; access_token?: string; expires_at?: number; email?: string; scope?: string };

const tokenFile = () => path.join(resolveDataDir(), "google-oauth.json");

async function readToken(): Promise<StoredToken | null> {
  try {
    return JSON.parse(await fs.readFile(tokenFile(), "utf8")) as StoredToken;
  } catch {
    return null;
  }
}

async function writeToken(t: StoredToken): Promise<void> {
  await fs.mkdir(resolveDataDir(), { recursive: true });
  const tmp = `${tokenFile()}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(t), { encoding: "utf8", mode: 0o600 });
  await fs.rename(tmp, tokenFile());
}

function emailFromIdToken(idToken?: string): string | undefined {
  if (!idToken) return undefined;
  try {
    return (JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")) as { email?: string }).email;
  } catch {
    return undefined;
  }
}

/** 同意画面から戻ってきた code をトークンに交換して保存する */
export async function exchangeCode(cfg: OAuthConfig, code: string): Promise<{ email?: string; scope?: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Googleとの接続に失敗しました（${res.status}）`);
  const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; id_token?: string; scope?: string };
  if (!data.refresh_token) throw new Error("更新用トークンが受け取れませんでした。もう一度「Googleアカウントで接続」からやり直してください。");
  if (!data.scope?.includes(GBP_SCOPE)) throw new Error("ビジネスプロフィールの管理を許可してください（同意画面のチェックを外さないでください）。");
  const email = emailFromIdToken(data.id_token);
  await writeToken({
    refresh_token: data.refresh_token,
    access_token: data.access_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    email,
    scope: data.scope,
  });
  return { email, scope: data.scope };
}

export async function isConnected(): Promise<boolean> {
  return Boolean((await readToken())?.refresh_token);
}

/** API呼び出し用のアクセストークン（期限切れなら更新する） */
export async function getAccessToken(): Promise<string> {
  const cfg = getOAuthConfig();
  const t = await readToken();
  if (!cfg || !t?.refresh_token) throw new Error("Googleアカウントが接続されていません");
  const now = Math.floor(Date.now() / 1000);
  if (t.access_token && t.expires_at && t.expires_at - 60 > now) return t.access_token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: t.refresh_token,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 400 || res.status === 401) throw new Error("Googleとの接続が切れました。もう一度「Googleアカウントで接続」してください。");
  if (!res.ok) throw new Error(`Googleの認証に失敗しました（${res.status}）`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  await writeToken({ ...t, access_token: data.access_token, expires_at: now + data.expires_in });
  return data.access_token;
}

/** 接続を解除する（Google側の許可も取り消し、保存したトークンを消す） */
export async function disconnect(): Promise<void> {
  const t = await readToken();
  if (t?.refresh_token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.refresh_token)}`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    }).catch(() => undefined);
  }
  await fs.rm(tokenFile(), { force: true });
}
