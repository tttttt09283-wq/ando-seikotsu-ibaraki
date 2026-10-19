import type { PunchType } from "./protocol";

/**
 * 通信障害時の打刻の送信待ち（端末の localStorage）。
 * 保存するのは「その打刻1回にしか使えない一回限りトークン」と打刻種別だけで、氏名・PIN は保存しない。
 * 送信できたもの、またはサーバーが受け付けないと判断したものは削除する。
 * 遅れて届いた打刻はサーバーの受信時刻で記録され、「遅延送信」として院長が確認する（端末時刻は参考値）。
 */
export interface QueuedPunch {
  sessionToken: string;
  punchType: PunchType;
  clientEventId: string;
  deviceReportedAt: string;
}

const KEY = "ando_kiosk_pending_punches";

export function loadQueue(): QueuedPunch[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as QueuedPunch[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedPunch[]) {
  try {
    if (queue.length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(queue));
  } catch {
    // 保存できない環境（プライベートモード等）では送信待ちを保持できない
  }
}

export function enqueue(item: QueuedPunch) {
  saveQueue([...loadQueue().filter((q) => q.clientEventId !== item.clientEventId), item]);
}

export function removeFromQueue(clientEventId: string) {
  saveQueue(loadQueue().filter((q) => q.clientEventId !== clientEventId));
}
