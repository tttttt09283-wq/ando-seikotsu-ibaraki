import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
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

/** 別サイトからの送信（CSRF）を拒否する：JSON かつ同一オリジンのみ受け付ける */
export function rejectCrossSite(request: NextRequest): NextResponse | null {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 415 });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  return null;
}

export const noStore = { "Cache-Control": "no-store" };

export function kioskJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}
