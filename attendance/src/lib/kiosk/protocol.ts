import { z } from "zod";

/** 端末 ↔ サーバーの入力（Zod で検証） */
export const registerBody = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^[A-Z0-9]{8}$/)),
});

export const authBody = z.object({
  staffCode: z.string().regex(/^[0-9]{4,8}$/),
  pin: z.string().regex(/^[0-9]{4,8}$/),
});

export const PUNCH_TYPES = ["clock_in", "break_start", "break_end", "clock_out"] as const;
export type PunchType = (typeof PUNCH_TYPES)[number];

export const punchBody = z.object({
  sessionToken: z.string().regex(/^[0-9a-f]{64}$/),
  punchType: z.enum(PUNCH_TYPES),
  clientEventId: z.uuid(),
  // 端末の時刻は参考値として保存するだけ（正式な打刻時刻はサーバーで確定）
  deviceReportedAt: z.iso.datetime({ offset: true }).optional(),
});

export const pinBody = z.object({
  sessionToken: z.string().regex(/^[0-9a-f]{64}$/),
  newPin: z.string().regex(/^[0-9]{4,8}$/),
});

export type StaffState = "off" | "working" | "on_break";

export const PUNCH_LABELS: Record<PunchType, string> = {
  clock_in: "出勤",
  break_start: "休憩開始",
  break_end: "休憩終了",
  clock_out: "退勤",
};

/** 状態ごとに押せる打刻 */
export function allowedPunches(state: StaffState): PunchType[] {
  switch (state) {
    case "off":
      return ["clock_in"];
    case "working":
      return ["break_start", "clock_out"];
    case "on_break":
      return ["break_end"];
  }
}

export const KIOSK_ERROR_MESSAGES: Record<string, string> = {
  invalid: "スタッフIDまたはPINが正しくありません",
  locked: "PINの入力に続けて失敗したためロックされています。しばらく待つか、院長・本部にご連絡ください",
  no_pin: "PINが登録されていません。本部にご連絡ください",
  throttled: "この端末での認証失敗が続いたため、一時的に停止しています。しばらくお待ちください",
  device_invalid: "この端末は登録されていないか、停止されています。本部にご連絡ください",
  session_invalid: "本人確認の有効期限が切れました。もう一度最初から操作してください",
  session_expired: "本人確認の有効期限が切れました。もう一度最初から操作してください",
  invalid_transition: "現在の状態ではその打刻はできません",
  weak_pin: "同じ数字の繰り返しや連番はPINに使えません",
  invalid_code: "登録コードが正しくないか、有効期限が切れています",
  bad_request: "入力内容を確認してください",
  rejected: "申請できませんでした",
  network: "通信できませんでした",
};

export const leaveBalanceBody = z.object({ sessionToken: z.string().regex(/^[0-9a-f]{64}$/) });

export const leaveRequestBody = z
  .object({
    sessionToken: z.string().regex(/^[0-9a-f]{64}$/),
    leaveType: z.enum(["paid", "holiday_credit", "other"]),
    startDate: z.iso.date(),
    endDate: z.iso.date().optional(),
    unit: z.enum(["full", "am", "pm"]),
    note: z.string().trim().max(200).optional(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate);

export const LEAVE_LABELS = { paid: "有給休暇", holiday_credit: "振休", other: "その他休暇" } as const;
export type LeaveKind = keyof typeof LEAVE_LABELS;
