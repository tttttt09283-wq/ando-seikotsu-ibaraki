import { NextResponse, type NextRequest } from "next/server";
import { getAuthConfig, isSessionAllowed, SESSION_COOKIE, verifySession } from "@/lib/auth/session";

/** 代表（president）が使える画面とAPI。それ以外は統括責任者のみ */
const PRESIDENT_PATHS = ["/president", "/api/state", "/api/approvals/", "/api/auth/logout"];

/**
 * 未ログインの画面アクセスはログイン画面へ、APIは401を返す。
 * 代表のログインでは、代表用の承認画面だけを開ける。
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const cfg = getAuthConfig();
  const raw = cfg.ok ? await verifySession(req.cookies.get(SESSION_COOKIE)?.value, cfg.secret) : null;
  const session = isSessionAllowed(raw, cfg) ? raw : null;
  const home = session?.sub === "president" ? "/president" : "/";

  if (pathname === "/login") {
    if (session) return NextResponse.redirect(new URL(home, req.url));
    return NextResponse.next();
  }
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (session.sub === "president" && !PRESIDENT_PATHS.some((p) => pathname === p || pathname.startsWith(p))) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "この操作の権限がありません" }, { status: 403 });
    return NextResponse.redirect(new URL("/president", req.url));
  }
  if (session.sub === "operator" && pathname.startsWith("/president")) {
    return NextResponse.redirect(new URL("/approvals", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth/login|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
