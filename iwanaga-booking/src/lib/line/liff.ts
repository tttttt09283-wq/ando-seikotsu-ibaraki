/**
 * LIFF / LINE Login の ID トークンをサーバー側で検証し、LINEユーザーIDを得る。
 * クライアントから送られた userId は信用せず、必ず LINE の verify エンドポイントで検証する。
 */
import "server-only";
import { config } from "../config";

export async function verifyLiffIdToken(idToken: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  const channelId = config.lineLoginChannelId;
  if (!channelId || !idToken) return null;
  try {
    const res = await fetcher("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }).toString(),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { sub?: string; aud?: string; exp?: number };
    if (json.aud !== channelId || !json.sub || !/^U[0-9a-f]{32}$/.test(json.sub)) return null;
    if (json.exp && json.exp * 1000 < Date.now()) return null;
    return json.sub;
  } catch {
    return null;
  }
}
