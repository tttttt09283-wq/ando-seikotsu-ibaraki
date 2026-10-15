import { NextResponse, type NextRequest } from "next/server";
import { getAuthConfig, SESSION_COOKIE, verifySession } from "@/lib/auth/session";

/** 未ログインの画面アクセスはログイン画面へ、APIは401を返す */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const cfg = getAuthConfig();
  const session = cfg.ok ? await verifySession(req.cookies.get(SESSION_COOKIE)?.value, cfg.secret) : null;
  const authorized = Boolean(session && (!cfg.ok || !cfg.passcodeRequired || session.via === "passcode"));

  if (pathname === "/login") {
    if (authorized) return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }
  if (authorized) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }
  const url = new URL("/login", req.url);
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api/auth/login|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
