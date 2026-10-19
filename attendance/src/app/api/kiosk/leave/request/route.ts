import type { NextRequest } from "next/server";
import { leaveRequestBody } from "@/lib/kiosk/protocol";
import { kioskJson, kioskSupabase, readDeviceSecret, rejectCrossSite } from "@/lib/kiosk/server";

/** 共用端末からの休暇申請（本人確認済みの一回限りトークンを消費）。承認は院長 → 本部 */
export async function POST(request: NextRequest) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const secret = await readDeviceSecret();
  if (!secret) return kioskJson({ ok: false, error: "device_invalid" }, 401);
  const parsed = leaveRequestBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return kioskJson({ ok: false, error: "bad_request" }, 400);
  const d = parsed.data;
  const { data, error } = await kioskSupabase().rpc("kiosk_request_leave", {
    p_secret: secret,
    p_session_token: d.sessionToken,
    p_type: d.leaveType,
    p_start: d.startDate,
    p_end: d.endDate ?? d.startDate,
    p_unit: d.unit,
    p_note: d.note ?? null,
  });
  if (error) return kioskJson({ ok: false, error: "server" }, 502);
  const r = data as Record<string, unknown>;
  if (!r.ok) return kioskJson({ ok: false, error: r.error, message: r.message }, 409);
  return kioskJson({ ok: true });
}
