import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { publicEnv } from "@/lib/env";

/** 端末シークレットを保存する Cookie（httpOnly：画面の JavaScript からは読めない） */
export const KIOSK_COOKIE = "ando_kiosk_device";
const FIVE_YEARS = 60 * 60 * 24 * 365 * 5;

/**
 * 共用端末用の Supabase クライアント。管理画面のログイン Cookie を使わず、常に未ログイン（anon）で呼ぶ。
 * 端末側の RPC は端末シークレットで認証し、打刻時刻はサーバー（DB）で確定する。
 */
export function kioskSupabase() {
  const env = publicEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function readDeviceSecret() {
  return (await cookies()).get(KIOSK_COOKIE)?.value ?? null;
}

export function setDeviceCookie(response: NextResponse, secret: string) {
  response.cookies.set(KIOSK_COOKIE, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: FIVE_YEARS,
  });
}

export { rejectCrossSite } from "./origin";

export const noStore = { "Cache-Control": "no-store" };

export function kioskJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}
