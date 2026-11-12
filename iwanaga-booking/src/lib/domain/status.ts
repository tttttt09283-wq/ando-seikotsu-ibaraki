import type { ReservationStatus } from "./types";

export const STATUS_LABEL: Record<ReservationStatus, string> = {
  draft: "入力中",
  pending_line: "仮予約（LINE送信待ち）",
  pending_review: "仮予約（LINE受付確認済み・確認待ち）",
  confirmed: "予約確定",
  change_proposed: "日時変更のご提案中",
  cancelled: "キャンセル",
  expired: "期限切れ",
  completed: "施術完了",
};

/** 管理画面用の短いラベル */
export const STATUS_SHORT: Record<ReservationStatus, string> = {
  draft: "入力中",
  pending_line: "LINE未確認",
  pending_review: "確認待ち",
  confirmed: "確定",
  change_proposed: "変更提案中",
  cancelled: "キャンセル",
  expired: "期限切れ",
  completed: "完了",
};

export type TransitionActor = "admin" | "line_webhook" | "customer" | "system";

/**
 * 状態遷移表。ここに無い遷移はすべて拒否する。
 * - confirmed への遷移は admin だけ（フォーム送信・LINE受信だけでは確定しない）
 * - pending_review への遷移は LINE受信（Webhook）か、管理者の手動照合だけ
 */
const TRANSITIONS: Array<{ from: ReservationStatus; to: ReservationStatus; actors: TransitionActor[] }> = [
  { from: "draft", to: "pending_line", actors: ["customer"] },
  { from: "pending_line", to: "pending_review", actors: ["line_webhook", "admin"] },
  { from: "pending_line", to: "cancelled", actors: ["admin", "customer"] },
  { from: "pending_line", to: "expired", actors: ["system"] },
  { from: "pending_review", to: "confirmed", actors: ["admin"] },
  { from: "pending_review", to: "change_proposed", actors: ["admin"] },
  { from: "pending_review", to: "cancelled", actors: ["admin", "customer"] },
  { from: "pending_review", to: "expired", actors: ["system"] },
  { from: "change_proposed", to: "confirmed", actors: ["admin"] },
  { from: "change_proposed", to: "change_proposed", actors: ["admin"] },
  { from: "change_proposed", to: "cancelled", actors: ["admin"] },
  { from: "change_proposed", to: "expired", actors: ["system"] },
  { from: "confirmed", to: "change_proposed", actors: ["admin"] },
  { from: "confirmed", to: "cancelled", actors: ["admin"] },
  { from: "confirmed", to: "completed", actors: ["admin"] },
];

export function canTransition(from: ReservationStatus, to: ReservationStatus, actor: TransitionActor): boolean {
  return TRANSITIONS.some((t) => t.from === from && t.to === to && t.actors.includes(actor));
}

export function allowedTargets(from: ReservationStatus, actor: TransitionActor): ReservationStatus[] {
  return TRANSITIONS.filter((t) => t.from === from && t.actors.includes(actor)).map((t) => t.to);
}

export function isTerminal(s: ReservationStatus): boolean {
  return s === "cancelled" || s === "expired" || s === "completed";
}

/** 利用者に「まだ確定ではない」ことを必ず表示するステータス */
export function isProvisional(s: ReservationStatus): boolean {
  return s === "pending_line" || s === "pending_review" || s === "change_proposed" || s === "draft";
}
