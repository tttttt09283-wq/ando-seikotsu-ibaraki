import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { buildAuthUrl, getOAuthConfig, OAUTH_STATE_COOKIE } from "@/lib/google/oauth";
import { requireRole } from "@/lib/server/api";

/** 「Googleアカウントで接続」：Googleの同意画面へ移動する（統括責任者のみ） */
export async function GET(req: NextRequest) {
  const actor = await requireRole(req, ["operator"]);
  if (actor instanceof NextResponse) return actor;
  const cfg = getOAuthConfig(req.nextUrl.origin);
  if (!cfg) return NextResponse.redirect(new URL("/reputation?google=not_configured", req.url));
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(buildAuthUrl(cfg, state));
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && req.nextUrl.protocol === "https:",
    path: "/api/google/callback",
    maxAge: 600,
  });
  return res;
}
