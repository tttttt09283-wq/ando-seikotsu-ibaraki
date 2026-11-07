// 休暇申請の表示用の定義
export type RequestStatus = "pending" | "returned" | "approved" | "rejected" | "withdrawn" | "cancelled";
export const REQUEST_STATUS: Record<RequestStatus, { text: string; tone: "warn" | "ok" | "danger" | "neutral" | "brand" }> = {
  pending: { text: "承認待ち", tone: "warn" },
  returned: { text: "差戻し", tone: "brand" },
  approved: { text: "承認済み（取得予定）", tone: "ok" },
  rejected: { text: "却下", tone: "danger" },
  withdrawn: { text: "取下げ", tone: "neutral" },
  cancelled: { text: "取消", tone: "neutral" },
};
export const KIND_LABEL: Record<"PAID" | "SHIFT", string> = { PAID: "有給", SHIFT: "振休" };
export const REJECT_CATEGORIES = ["申請内容の不備", "時季変更の申し入れ", "その他"] as const;
export const EVENT_LABEL: Record<string, string> = {
  submit: "申請", resubmit: "再申請", approve: "承認", return: "差戻し", reject: "却下", withdraw: "取下げ", cancel: "取消", confirm_taken: "取得済み",
};

// 選んだ日付を並べ替え・重複を除く（"YYYY-MM-DD"）
export function normalizeDates(input: string[]): string[] {
  return [...new Set(input.map((d) => d.trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
}

export function formatDates(dates: string[]): string {
  return dates.map((d) => { const [, m, day] = d.split("-").map(Number); return `${m}/${day}`; }).join("・");
}

// 申請前の残数チェック（表示用。最終判断は DB）
export function shortageOf(requested: number, available: number, pendingOther: number): boolean {
  return requested > available - pendingOther;
}
