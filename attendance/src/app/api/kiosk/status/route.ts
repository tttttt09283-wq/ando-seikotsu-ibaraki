import { kioskJson, kioskSupabase, readDeviceSecret } from "@/lib/kiosk/server";

/** 端末の登録状態とサーバー時刻（端末の時計表示の補正に使う） */
export async function GET() {
  const secret = await readDeviceSecret();
  if (!secret) return kioskJson({ ok: false, error: "unregistered", serverTime: new Date().toISOString() });
  try {
    const { data, error } = await kioskSupabase().rpc("kiosk_device_info", { p_secret: secret });
    if (error) return kioskJson({ ok: false, error: "server", serverTime: new Date().toISOString() }, 502);
    const r = data as { ok: boolean; error?: string; server_time: string; clinic_name?: string; device_name?: string };
    return kioskJson({ ok: r.ok, error: r.error, serverTime: r.server_time, clinicName: r.clinic_name, deviceName: r.device_name });
  } catch {
    return kioskJson({ ok: false, error: "server", serverTime: new Date().toISOString() }, 502);
  }
}
