// Googleスプレッドシートをサーバー側で読むための最小限のクライアント（追加パッケージ不要）
//
// 事前準備（Vercelの環境変数）:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL … サービスアカウントのメールアドレス（xxx@xxx.iam.gserviceaccount.com）
//   GOOGLE_PRIVATE_KEY           … サービスアカウントの秘密鍵（"-----BEGIN PRIVATE KEY-----" から始まる文字列）
// 読み込むスプレッドシートを、上のサービスアカウントのメールアドレスに「閲覧者」で共有してください。

import crypto from "node:crypto";

let cachedToken = null; // { token, exp }

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) throw new Error("サーバー側に GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY が設定されていません");
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  // Vercelの環境変数では改行が「\n」の文字になっていることがあるので戻す
  const key = rawKey.replace(/\\n/g, "\n");
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signature = crypto.createSign("RSA-SHA256").update(`${header}.${claim}`).sign(key);
  const jwt = `${header}.${claim}.${base64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Googleの認証に失敗しました: ${data.error_description || data.error || res.status}`);
  cachedToken = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return cachedToken.token;
}

// ranges: ["'個人'!A1:AA400", ...] → 各範囲の2次元配列（同じ順番）
export async function batchGet(spreadsheetId, ranges, valueRenderOption = "UNFORMATTED_VALUE") {
  const token = await getAccessToken();
  const params = new URLSearchParams({ valueRenderOption });
  for (const r of ranges) params.append("ranges", r);
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = (data.error && data.error.message) || res.status;
    throw new Error(`スプレッドシートを読み込めませんでした（${msg}）。サービスアカウントに共有されているか確認してください`);
  }
  return (data.valueRanges || []).map((v) => v.values || []);
}
