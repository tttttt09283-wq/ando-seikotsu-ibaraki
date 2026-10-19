import type { NextRequest } from "next/server";
import { authBody } from "@/lib/kiosk/protocol";
import { kioskJson, kioskSupabase, readDeviceSecret, rejectCrossSite } from "@/lib/kiosk/server";

/** スタッフID＋PIN の本人確認。成功すると打刻1回分の一回限りトークンを返す */
export async function POST(request: NextRequest) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const secret = await readDeviceSecret();
  if (!secret) return kioskJson({ ok: false, error: "device_invalid" }, 401);
  const parsed = authBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return kioskJson({ ok: false, error: "invalid" }, 400);

  const { data, error } = await kioskSupabase().rpc("kiosk_authenticate", {
    p_secret: secret,
    p_staff_code: parsed.data.staffCode,
    p_pin: parsed.data.pin,
  });
  if (error) return kioskJson({ ok: false, error: "server" }, 502);
  const r = data as Record<string, unknown>;
  if (!r.ok) return kioskJson({ ok: false, error: r.error, remaining: r.remaining, lockedUntil: r.locked_until }, 401);
  return kioskJson({
    ok: true,
    sessionToken: r.session_token,
    staffName: r.staff_name,
    state: r.state,
    mustChangePin: r.must_change_pin,
  });
}
