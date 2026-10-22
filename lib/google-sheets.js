// Googleスプレッドシートをサーバー側で読むための最小限のクライアント（追加パッケージ不要）
//
// 事前準備（Vercelの環境変数）:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL … サービスアカウントのメールアドレス（xxx@xxx.iam.gserviceaccount.com）
//   GOOGLE_PRIVATE_KEY           … サービスアカウントの秘密鍵（"-----BEGIN PRIVATE KEY-----" から始まる文字列）
// 「進捗売上実績」は「閲覧者」、「キャリア制度台帳」は（人件費を画面から書き込むため）「編集者」で、
// 上のサービスアカウントのメールアドレスに共有してください。

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
    scope: "https://www.googleapis.com/auth/spreadsheets",
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

// data: [{ range: "'シート'!C3", values: [[123]] }, ...] を書き込む
// valueInputOption: "USER_ENTERED"（数式・日付として解釈）／"RAW"（そのままの文字。"0123" を残したいとき）
export async function batchUpdate(spreadsheetId, data, valueInputOption = "USER_ENTERED") {
  const token = await getAccessToken();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ valueInputOption, data }),
  });
  const body = await res.json();
  if (!res.ok) {
    const msg = (body.error && body.error.message) || res.status;
    throw new Error(`スプレッドシートに書き込めませんでした（${msg}）。サービスアカウントが「編集者」で共有されているか確認してください`);
  }
  return body;
}

async function sheetsFetch(url, options, errorPrefix) {
  const token = await getAccessToken();
  const res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  const body = await res.json();
  if (!res.ok) {
    const msg = (body.error && body.error.message) || res.status;
    throw new Error(`${errorPrefix}（${msg}）`);
  }
  return body;
}

// シート（タブ）名の一覧
export async function getSheetTitles(spreadsheetId) {
  const body = await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, {}, "スプレッドシートを読み込めませんでした");
  return (body.sheets || []).map((s) => s.properties.title);
}

// シート（タブ）を追加する
export async function addSheets(spreadsheetId, titles) {
  if (!titles.length) return;
  await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: titles.map((title) => ({ addSheet: { properties: { title } } })) }),
  }, "シートを追加できませんでした。サービスアカウントが「編集者」で共有されているか確認してください");
}

// 表の末尾に行を追加する
export async function appendRows(spreadsheetId, range, rows) {
  if (!rows.length) return;
  const params = new URLSearchParams({ valueInputOption: "RAW", insertDataOption: "INSERT_ROWS" });
  await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?${params}`, {
    method: "POST",
    body: JSON.stringify({ values: rows }),
  }, "スプレッドシートに書き込めませんでした。サービスアカウントが「編集者」で共有されているか確認してください");
}
