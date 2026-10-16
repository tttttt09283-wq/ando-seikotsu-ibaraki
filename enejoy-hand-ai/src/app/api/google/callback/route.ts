import { NextResponse, type NextRequest } from "next/server";
import { markGoogleConnected, syncGoogle } from "@/lib/engine/reputation";
import { createGoogleApi } from "@/lib/google/client";
import { exchangeCode, getAccessToken, getOAuthConfig, OAUTH_STATE_COOKIE } from "@/lib/google/oauth";
import { requireRole } from "@/lib/server/api";
import { getEngineDeps } from "@/lib/server/runtime";

/** Googleの同意画面から戻ってくる先。state を確かめてからトークンを保存し、最初の同期を行う */
export async function GET(req: NextRequest) {
  const actor = await requireRole(req, ["operator"]);
  if (actor instanceof NextResponse) return actor;
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/reputation?${q}`, req.url));
    res.cookies.set(OAUTH_STATE_COOKIE, "", { path: "/api/google/callback", maxAge: 0 });
    return res;
  };
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back(`google=denied`);
  const state = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!state || state !== p.get("state")) return back("google=state_mismatch");
  const cfg = getOAuthConfig(req.nextUrl.origin);
  const code = p.get("code");
  if (!cfg || !code) return back("google=not_configured");
  try {
    const { email } = await exchangeCode(cfg, code);
    const deps = getEngineDeps();
    await markGoogleConnected(deps, actor.memberId, email);
    try {
      await syncGoogle(deps, createGoogleApi(getAccessToken), { actorId: actor.memberId });
    } catch {
      // 同期の失敗は画面に表示する（接続自体は完了）
    }
    return back("google=connected");
  } catch (e) {
    return back(`google=error&message=${encodeURIComponent((e as Error).message)}`);
  }
}
