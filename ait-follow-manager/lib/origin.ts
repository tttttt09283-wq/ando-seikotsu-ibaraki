import "server-only";
import { env } from "@/lib/env";

/** 更新系・出力系の Route Handler 用 CSRF 対策：Origin が自サイトであることを確認する */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set([new URL(env().SITE_URL).origin, new URL(request.url).origin]);
  return allowed.has(origin);
}
