/**
 * LINE Webhook の処理本体（ルートハンドラから呼ぶ。テストしやすいよう分離）。
 *   1. 署名検証（生のボディ）
 *   2. 送信元照合：destination がこの公式アカウントのボットか / source が 1:1 のユーザーか
 *   3. イベント重複排除（webhookEventId。LINE の再送も含めて1回だけ処理）
 *   4. テキストメッセージに予約番号＋確認コードがあれば仮予約と照合 → pending_review
 */
import "server-only";
import { config } from "../config";
import type { Repo } from "../repo/types";
import { handleLineTextMessage, type LineMatchResult } from "../services/reservations";
import { verifyLineSignature } from "./signature";

interface LineEvent {
  type: string;
  mode?: "active" | "standby";
  webhookEventId?: string;
  timestamp?: number;
  replyToken?: string;
  deliveryContext?: { isRedelivery?: boolean };
  source?: { type: "user" | "group" | "room"; userId?: string };
  message?: { type: string; id?: string; text?: string };
}

export interface WebhookOutcome {
  status: number;
  body: { ok: boolean; error?: string; results?: Array<{ id: string; result: string }> };
}

export async function processLineWebhook(repo: Repo, rawBody: string, signature: string | null, now: Date): Promise<WebhookOutcome> {
  const secret = config.lineChannelSecret;
  if (!secret) return { status: 503, body: { ok: false, error: "LINE not configured" } };
  if (!verifyLineSignature(secret, rawBody, signature)) return { status: 401, body: { ok: false, error: "invalid signature" } };

  let payload: { destination?: string; events?: LineEvent[] };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { ok: false, error: "invalid json" } };
  }
  // 送信元照合：別のチャネル宛てのWebhookは処理しない
  const bot = config.lineBotUserId;
  if (bot && payload.destination !== bot) return { status: 403, body: { ok: false, error: "destination mismatch" } };

  const results: Array<{ id: string; result: string }> = [];
  for (const ev of payload.events ?? []) {
    const id = ev.webhookEventId;
    if (!id || !/^[0-9A-Za-z]{10,64}$/.test(id)) {
      results.push({ id: String(id), result: "invalid_event_id" });
      continue;
    }
    const fresh = await repo.recordWebhookEvent(id, ev.type);
    if (!fresh) {
      results.push({ id, result: "duplicate" });
      continue;
    }
    let result: LineMatchResult | string = "ignored";
    try {
      if (ev.mode === "standby") result = "standby";
      else if (ev.type === "message" && ev.message?.type === "text" && ev.source?.type === "user" && ev.source.userId && /^U[0-9a-f]{32}$/.test(ev.source.userId)) {
        result = await handleLineTextMessage(repo, { lineUserId: ev.source.userId, text: ev.message.text ?? "", replyToken: ev.replyToken }, now);
      }
    } catch (e) {
      console.error("line webhook event failed", e);
      result = "error";
    }
    await repo.setWebhookEventResult(id, result);
    results.push({ id, result });
  }
  // LINE には常に 200 を返す（再送ループを避ける。個別の結果は記録済み）
  return { status: 200, body: { ok: true, results } };
}
