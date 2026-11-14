/**
 * Proxy（旧 Middleware）：管理画面の Supabase Auth セッションを更新するだけ。
 * 認可は必ずサーバー側（requireAdminPage / getCurrentAdmin）で行う。
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublic } from "./lib/public-config";

export async function proxy(request: NextRequest) {
  const pub = supabasePublic();
  let response = NextResponse.next({ request });
  if (!pub) return response;
  const { url, anonKey: key } = pub;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
