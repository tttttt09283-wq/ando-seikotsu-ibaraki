import type { NextRequest } from "next/server";
import { pinBody } from "@/lib/kiosk/protocol";
import { kioskJson, kioskSupabase, readDeviceSecret, rejectCrossSite } from "@/lib/kiosk/server";

/** 端末での PIN 変更（初回は本部発行の PIN から本人が変更する）。新しい一回限りトークンを返す */
export async function POST(request: NextRequest) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const secret = await readDeviceSecret();
  if (!secret) return kioskJson({ ok: false, error: "device_invalid" }, 401);
  const parsed = pinBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return kioskJson({ ok: false, error: "weak_pin" }, 400);

  const { data, error } = await kioskSupabase().rpc("kiosk_change_pin", {
    p_secret: secret,
    p_session_token: parsed.data.sessionToken,
    p_new_pin: parsed.data.newPin,
  });
  if (error) return kioskJson({ ok: false, error: "server" }, 502);
  const r = data as Record<string, unknown>;
  if (!r.ok) return kioskJson({ ok: false, error: r.error, message: r.message }, 400);
  return kioskJson({ ok: true, sessionToken: r.session_token });
}
