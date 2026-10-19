import type { NextRequest } from "next/server";
import { leaveBalanceBody } from "@/lib/kiosk/protocol";
import { kioskJson, kioskSupabase, readDeviceSecret, rejectCrossSite } from "@/lib/kiosk/server";

/** 休暇申請画面に表示する使用可能な残数（申請中の分を差し引き済み）。トークンは消費しない */
export async function POST(request: NextRequest) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const secret = await readDeviceSecret();
  if (!secret) return kioskJson({ ok: false, error: "device_invalid" }, 401);
  const parsed = leaveBalanceBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return kioskJson({ ok: false, error: "bad_request" }, 400);
  const { data, error } = await kioskSupabase().rpc("kiosk_leave_balances", { p_secret: secret, p_session_token: parsed.data.sessionToken });
  if (error) return kioskJson({ ok: false, error: "server" }, 502);
  const r = data as Record<string, unknown>;
  if (!r.ok) return kioskJson({ ok: false, error: r.error }, 401);
  return kioskJson({ ok: true, paid: Number(r.paid), holidayCredit: Number(r.holiday_credit), halfDay: Boolean(r.half_day) });
}
