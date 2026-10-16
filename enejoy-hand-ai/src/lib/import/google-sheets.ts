import { createSign } from "node:crypto";
import { promises as fs } from "node:fs";
import { parseCsv } from "./csv";
export { extractGid, extractSpreadsheetId } from "./google-sheets-url";

/**
 * Googleスプレッドシート（日計表）の読み取り。書き込みは一切しない。
 *
 * 1. サービスアカウント（推奨）：GOOGLE_SERVICE_ACCOUNT_KEY_FILE に鍵ファイル（JSON）のパスを設定し、
 *    シートをそのサービスアカウントのメールアドレスに「閲覧者」で共有する。シート自体は非公開のままでよい。
 * 2. 公開リンク：シートが「リンクを知っている全員」に共有されている場合のみ、CSVの書き出しURLで読む。
 *    経営数値が誰でも見られる状態になるため、本番ではサービスアカウントへの切り替えを推奨。
 */

type ServiceAccount = { client_email: string; private_key: string };

let cachedToken: { token: string; exp: number } | null = null;

async function loadServiceAccount(): Promise<ServiceAccount | null> {
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (!file) return null;
  const json = JSON.parse(await fs.readFile(file, "utf8")) as ServiceAccount;
  if (!json.client_email || !json.private_key) throw new Error("サービスアカウントの鍵ファイルの形式が正しくありません");
  return json;
}

export function sheetsAuthMode(): "service_account" | "public_link" {
  return process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ? "service_account" : "public_link";
}

const b64url = (s: string) => Buffer.from(s).toString("base64url");

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const sig = createSign("RSA-SHA256").update(`${header}.${claim}`).sign(sa.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claim}.${sig}` }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Googleの認証に失敗しました（${res.status}）`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, exp: now + data.expires_in };
  return data.access_token;
}

/** シートの表を文字列の2次元配列で返す（表示されている書式のまま） */
export async function fetchSheetGrid(spreadsheetId: string, sheetName: string, gid?: string): Promise<string[][]> {
  const sa = await loadServiceAccount();
  if (sa) {
    const token = await accessToken(sa);
    const range = encodeURIComponent(`'${sheetName.replace(/'/g, "''")}'!A1:AZ80`);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) },
    );
    if (res.status === 403 || res.status === 404) {
      throw new Error(`シートを読めません（${res.status}）。シートをサービスアカウント（${sa.client_email}）に共有し、シート名「${sheetName}」を確認してください。`);
    }
    if (!res.ok) throw new Error(`シートの読み取りに失敗しました（${res.status}）`);
    const data = (await res.json()) as { values?: unknown[][] };
    return (data.values ?? []).map((row) => row.map((c) => (c == null ? "" : String(c))));
  }
  // 公開リンク：シート名では指定できないため、URL の gid（なければ先頭のシート＝TOP）を CSV で書き出す
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || type.includes("text/html")) {
    throw new Error(
      "シートを読めません。シートが非公開の場合は、サービスアカウントの設定（GOOGLE_SERVICE_ACCOUNT_KEY_FILE）が必要です。",
    );
  }
  return parseCsv(await res.text());
}
