/**
 * LINE Messaging API クライアント（fetch のみ。アクセストークンはサーバーの環境変数から読む）。
 */
import "server-only";
import { config } from "../config";

export interface LineSendResult {
  ok: boolean;
  status: number;
  error?: string;
}

type Fetcher = typeof fetch;
let fetcher: Fetcher = (...args) => fetch(...args);
/** テスト用：送信処理を差し替える */
export function setLineFetcher(f: Fetcher | null) {
  fetcher = f ?? ((...args) => fetch(...args));
}

async function call(path: string, body: unknown, retryKey?: string): Promise<LineSendResult> {
  const token = config.lineChannelAccessToken;
  if (!token) return { ok: false, status: 0, error: "LINE_CHANNEL_ACCESS_TOKEN 未設定" };
  try {
    const res = await fetcher(`https://api.line.me/v2/bot/message/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        // 同じ再送キーなら LINE 側で二重送信されない（push のみ）
        ...(retryKey ? { "X-Line-Retry-Key": retryKey } : {}),
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true, status: res.status };
    // 409 = 同じ再送キーで送信済み → 成功扱い
    if (res.status === 409 && retryKey) return { ok: true, status: 409 };
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: `LINE API ${res.status} ${text.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, status: 0, error: `LINE API 通信エラー: ${(e as Error).message}` };
  }
}

export function pushText(to: string, text: string, retryKey?: string) {
  return call("push", { to, messages: [{ type: "text", text: text.slice(0, 5000) }] }, retryKey);
}

export function replyText(replyToken: string, text: string) {
  return call("reply", { replyToken, messages: [{ type: "text", text: text.slice(0, 5000) }] });
}
