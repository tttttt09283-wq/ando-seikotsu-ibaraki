// 会議・議事録・タスクの表示用（純粋関数。期限の判定そのものは DB の mgmt.minutes_is_late）
export type MeetingStatus = "scheduled" | "awaiting_minutes" | "submitted" | "overdue" | "exempt";
export const MEETING_STATUS: Record<MeetingStatus, { text: string; tone: "warn" | "ok" | "danger" | "neutral" | "brand" }> = {
  scheduled: { text: "開催予定", tone: "neutral" },
  awaiting_minutes: { text: "議事録未提出", tone: "warn" },
  submitted: { text: "提出済み", tone: "ok" },
  overdue: { text: "期限超過", tone: "danger" },
  exempt: { text: "対象外（移行前）", tone: "neutral" },
};
export function meetingStatusLabel(status: MeetingStatus, late: boolean): string {
  return status === "submitted" && late ? "提出済み（期限超過）" : MEETING_STATUS[status].text;
}

export type TaskStatus = "todo" | "doing" | "done";
export const TASK_STATUS: Record<TaskStatus, string> = { todo: "未着手", doing: "進行中", done: "完了" };
export const PRIORITY: Record<"high" | "mid" | "low", string> = { high: "高", mid: "中", low: "低" };

// 期限までの残り時間（「残り2日3時間」「あと45分」「12時間超過」）
export function remainingLabel(dueIso: string, now: Date = new Date()): string {
  // 期限は 23:59:59 なので、次の 0:00 を締め切りとして数える
  const end = new Date(dueIso).getTime() + 1000;
  const diff = end - now.getTime();
  const abs = Math.abs(diff);
  const d = Math.floor(abs / 86400000), h = Math.floor((abs % 86400000) / 3600000), m = Math.floor((abs % 3600000) / 60000);
  const text = d > 0 ? `${d}日${h}時間` : h > 0 ? `${h}時間${m}分` : `${m}分`;
  return diff > 0 ? `残り${text}` : `${text}超過`;
}

// 期限切れのタスク（JSTの今日より前で未完了）
export function isTaskOverdue(due: string | null, status: TaskStatus, today: string): boolean {
  return !!due && status !== "done" && due < today;
}

export type DecisionInput = { id: number | null; title: string; detail: string; owner_user_id: string; due_date: string };
// 空の行を除き、送る形にそろえる
export function cleanDecisions(rows: DecisionInput[]): DecisionInput[] {
  return rows.map((r) => ({ ...r, title: r.title.trim(), detail: r.detail.trim() })).filter((r) => r.title || r.detail || r.owner_user_id || r.due_date || r.id);
}
