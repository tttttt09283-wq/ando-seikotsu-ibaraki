/**
 * ===== 匿名の利用統計 =====
 * 同意した利用者についてのみ、個人を特定しない情報（年代・症状カテゴリ・各チェック結果・
 * スコア・ランク・予約ボタンのクリック有無）を送信します。氏名・電話番号・メールなどは扱いません。
 *
 * NEXT_PUBLIC_STATS_ENABLED が true でない場合は、何も送信しません。
 */
import { AGE_GROUPS, CHECK_ORDER, SYMPTOMS } from "@/config/checks";
import type { AgeGroupId, CheckId, RankId, ScoreResult, SymptomId } from "@/types";

export interface CompletionEvent {
  type: "complete";
  sessionId: string;
  ageGroup: AgeGroupId | null;
  symptoms: SymptomId[];
  /** 各チェックの点数（未測定は null） */
  scores: Record<CheckId, number | null>;
  total: number | null;
  rank: RankId | null;
}

export interface BookingClickEvent {
  type: "booking_click";
  sessionId: string;
}

export type StatsEvent = CompletionEvent | BookingClickEvent;

export function buildCompletionEvent(
  sessionId: string,
  ageGroup: AgeGroupId | null,
  symptoms: SymptomId[],
  result: ScoreResult,
): CompletionEvent {
  const scores = Object.fromEntries(result.items.map((i) => [i.id, i.score])) as Record<CheckId, number | null>;
  return { type: "complete", sessionId, ageGroup, symptoms, scores, total: result.total, rank: result.rank };
}

const SESSION_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

/** サーバー側で受け取ったデータが正しい形かを確認する（不正なデータは保存しない） */
export function validateStatsEvent(raw: unknown): StatsEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.sessionId !== "string" || !SESSION_ID_RE.test(r.sessionId)) return null;

  if (r.type === "booking_click") return { type: "booking_click", sessionId: r.sessionId };
  if (r.type !== "complete") return null;

  const ageIds = AGE_GROUPS.map((a) => a.id) as string[];
  const symptomIds = SYMPTOMS.map((s) => s.id) as string[];
  if (r.ageGroup !== null && !ageIds.includes(r.ageGroup as string)) return null;
  if (!Array.isArray(r.symptoms) || r.symptoms.length > symptomIds.length) return null;
  if (!r.symptoms.every((s) => symptomIds.includes(s))) return null;

  if (!r.scores || typeof r.scores !== "object") return null;
  const scores = {} as Record<CheckId, number | null>;
  for (const id of CHECK_ORDER) {
    const v = (r.scores as Record<string, unknown>)[id];
    if (v === null) scores[id] = null;
    else if (typeof v === "number" && v >= 0 && v <= 20) scores[id] = v;
    else return null;
  }
  const total = r.total;
  if (!(total === null || (typeof total === "number" && Number.isInteger(total) && total >= 0 && total <= 100))) {
    return null;
  }
  const rank = r.rank;
  if (!(rank === null || rank === "S" || rank === "A" || rank === "B" || rank === "C")) return null;

  return {
    type: "complete",
    sessionId: r.sessionId,
    ageGroup: r.ageGroup as AgeGroupId | null,
    symptoms: [...new Set(r.symptoms as SymptomId[])],
    scores,
    total,
    rank,
  };
}

/** ブラウザから統計を送る。失敗しても利用者の画面には影響させない */
export async function sendStats(event: StatsEvent): Promise<boolean> {
  try {
    const body = JSON.stringify(event);
    // 予約ページへ移動する直前でも届きやすい sendBeacon を優先
    if (event.type === "booking_click" && typeof navigator !== "undefined" && navigator.sendBeacon) {
      return navigator.sendBeacon("/api/stats", new Blob([body], { type: "application/json" }));
    }
    const res = await fetch("/api/stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}
