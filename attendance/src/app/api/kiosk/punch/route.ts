import type { NextRequest } from "next/server";
import { punchBody } from "@/lib/kiosk/protocol";
import { kioskJson, kioskSupabase, readDeviceSecret, rejectCrossSite } from "@/lib/kiosk/server";

/** 打刻。時刻は DB の now() で確定する（端末時刻は参考値として送るだけ） */
export async function POST(request: NextRequest) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const secret = await readDeviceSecret();
  if (!secret) return kioskJson({ ok: false, error: "device_invalid" }, 401);
  const parsed = punchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return kioskJson({ ok: false, error: "bad_request" }, 400);

  const { data, error } = await kioskSupabase().rpc("kiosk_punch", {
    p_secret: secret,
    p_session_token: parsed.data.sessionToken,
    p_punch_type: parsed.data.punchType,
    p_client_event_id: parsed.data.clientEventId,
    p_device_reported_at: parsed.data.deviceReportedAt ?? null,
  });
  if (error) return kioskJson({ ok: false, error: "server" }, 502);
  const r = data as Record<string, unknown>;
  if (!r.ok) return kioskJson({ ok: false, error: r.error, state: r.state }, 409);
  return kioskJson({
    ok: true,
    duplicate: r.duplicate,
    punchType: r.punch_type,
    punchedAt: r.punched_at,
    staffName: r.staff_name,
    delayed: r.delayed ?? false,
  });
}
