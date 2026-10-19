import type { NextRequest } from "next/server";
import { registerBody } from "@/lib/kiosk/protocol";
import { kioskJson, kioskSupabase, rejectCrossSite, setDeviceCookie } from "@/lib/kiosk/server";

/** 本部が発行した登録コードで端末を有効化し、端末シークレットを httpOnly Cookie に保存する */
export async function POST(request: NextRequest) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const parsed = registerBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return kioskJson({ ok: false, error: "invalid_code" }, 400);

  const { data, error } = await kioskSupabase().rpc("kiosk_register_device", { p_code: parsed.data.code });
  if (error) return kioskJson({ ok: false, error: "server" }, 502);
  const r = data as { ok: boolean; error?: string; secret?: string; clinic_name?: string; device_name?: string };
  if (!r.ok || !r.secret) return kioskJson({ ok: false, error: r.error ?? "invalid_code" }, 400);

  const response = kioskJson({ ok: true, clinicName: r.clinic_name, deviceName: r.device_name });
  setDeviceCookie(response, r.secret);
  return response;
}
