/**
 * ===== 予約ページへのリンク =====
 * 予約ページのURLに「カラダ年齢チェックから来た」目印（src=body-check）と、結果の要約（bc）を付けます。
 * 予約フォーム（booking.html）がこれを読み取り、予約データ・LINE通知・管理画面に表示します。
 * 氏名などの個人情報は含めません。
 */
import { RANKS } from "@/config/scoring";
import type { BodyAgeResult } from "@/lib/bodyAge";
import type { ScoreResult } from "@/types";

export const BOOKING_SOURCE_PARAM = "src";
export const BOOKING_SOURCE_VALUE = "body-check";
export const BOOKING_SUMMARY_PARAM = "bc";

/** 例：「カラダ年齢 50代レベル／スコア68点・Bランク」 */
export function buildBodyCheckSummary(result: ScoreResult, bodyAge: BodyAgeResult | null): string {
  const parts: string[] = [];
  if (bodyAge) parts.push(`カラダ年齢 ${bodyAge.band.label}レベル`);
  if (result.total !== null) {
    const rank = RANKS.find((r) => r.id === result.rank);
    parts.push(`スコア${result.total}点${rank ? `・${rank.title}` : ""}`);
  }
  return parts.length > 0 ? parts.join("／") : "結果なし（全項目スキップ）";
}

/** 予約URLに目印と要約を付ける（元のURLにあるパラメータは残す） */
export function buildBookingUrl(baseUrl: string, summary: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set(BOOKING_SOURCE_PARAM, BOOKING_SOURCE_VALUE);
  url.searchParams.set(BOOKING_SUMMARY_PARAM, summary.slice(0, 100));
  return url.toString();
}
