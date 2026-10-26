import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { getActor } from "@/lib/auth/session";
import { isHq } from "@/lib/auth/permissions";
import { createSupabaseServer } from "@/lib/supabase/server";
import { toUserMessage } from "@/lib/errors";
import { isSameOrigin } from "@/lib/kiosk/origin";
import { generatePin } from "@/lib/kiosk/pin";
import { kitRequestSchema, pinStateOf, reusableDeviceId, staffToIssue, type OverviewRow } from "@/lib/kit/plan";
import { buildKitWorkbook, type KitInput } from "@/lib/kit/workbook";
import { formatJstDateTime, todayJst } from "@/lib/time/jst";
import { isActiveOn, type AccountRow, type RoleGrantRow } from "@/lib/data/types";

const fail = (message: string, status = 400) => new NextResponse(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

/**
 * 院の「使い始めセット」を作って Excel で返す（本部のみ）。
 * 端末の登録コードとスタッフの PIN をここで発行するため POST のみ。発行した値はこのファイルにだけ載る。
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail("forbidden", 403);
  const actor = await getActor();
  if (!actor || !isHq(actor)) return fail("本部のアカウントでログインしてください", 403);

  const form = await request.formData();
  const raw = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
  const parsed = kitRequestSchema.safeParse(raw);
  if (!parsed.success) return fail("入力内容を確認してください");
  const req = parsed.data;

  const supabase = await createSupabaseServer();
  const today = todayJst();
  const [{ data: clinic }, { data: overview, error: overviewError }, { data: roleData }, { data: deviceData }] = await Promise.all([
    supabase.from("clinics").select("clinic_id, name").eq("clinic_id", req.clinic_id).maybeSingle(),
    supabase.rpc("clinic_pin_overview", { p_clinic_id: req.clinic_id }),
    supabase.from("user_roles").select("*").eq("role", "clinic_manager").eq("clinic_id", req.clinic_id),
    supabase.from("kiosk_devices").select("device_id, clinic_id, name, status").eq("clinic_id", req.clinic_id),
  ]);
  if (!clinic) return fail("院が見つかりません", 404);
  if (overviewError) return fail(toUserMessage(overviewError));

  const managerIds = ((roleData ?? []) as RoleGrantRow[]).filter((r) => isActiveOn(r, today)).map((r) => r.user_id);
  const { data: accountData } = managerIds.length
    ? await supabase.from("app_accounts").select("user_id, email, display_name, disabled").in("user_id", managerIds)
    : { data: [] };
  const managers = ((accountData ?? []) as AccountRow[]).filter((a) => !a.disabled).map((a) => ({ name: a.display_name, email: a.email }));

  // 端末の登録コード
  let registration: KitInput["registration"] = null;
  const origin = request.nextUrl.origin;
  const forwardedHost = request.headers.get("x-forwarded-host");
  const base = forwardedHost ? `${request.headers.get("x-forwarded-proto") ?? "https"}://${forwardedHost}` : origin;
  const kioskUrl = `${base}/kiosk`;
  if (req.device_mode === "new") {
    const devices = (deviceData ?? []) as { device_id: string; clinic_id: string; name: string; status: string }[];
    const { data, error } = await supabase.rpc("issue_kiosk_registration", {
      p_clinic_id: req.clinic_id,
      p_name: req.device_name,
      p_device_id: reusableDeviceId(devices, req.clinic_id, req.device_name),
      p_valid_hours: req.valid_days * 24,
    });
    if (error) return fail(toUserMessage(error));
    const r = data as { code: string; expires_at: string };
    const qrPng = await QRCode.toBuffer(`${kioskUrl}#code=${r.code}`, { width: 360, margin: 2 });
    registration = { deviceName: req.device_name, code: r.code, expiresAt: formatJstDateTime(r.expires_at), qrPng };
  }

  // スタッフの PIN（1人ずつ発行。発行に失敗した人は「未発行／発行済み」のまま一覧に載せる）
  const rows = (overview ?? []) as OverviewRow[];
  const pins = new Map<string, string>();
  const failures: string[] = [];
  for (const s of staffToIssue(rows, req.pin_mode)) {
    const pin = generatePin();
    const { error } = await supabase.rpc("set_kiosk_pin", { p_staff_id: s.staff_id, p_pin: pin });
    if (error) failures.push(`${s.staff_code}：${toUserMessage(error)}`);
    else pins.set(s.staff_id, pin);
  }
  if (failures.length && pins.size === 0 && !registration) return fail(`PINを発行できませんでした\n${failures.join("\n")}`);

  const body = await buildKitWorkbook({
    clinicName: clinic.name,
    issuedAt: formatJstDateTime(new Date()),
    appUrl: `${base}/login`,
    kioskUrl,
    registration,
    managers,
    staff: rows.map((s) => ({
      code: s.staff_code,
      name: `${s.family_name} ${s.given_name}`,
      pin: pins.get(s.staff_id) ?? null,
      state: pinStateOf(s, pins.has(s.staff_id)),
    })),
  });
  const filename = `使い始めセット_${clinic.name}_${today}.xlsx`;
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="starter-kit.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
    },
  });
}
