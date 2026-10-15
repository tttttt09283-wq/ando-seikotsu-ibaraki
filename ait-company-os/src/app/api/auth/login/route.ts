import { NextResponse, type NextRequest } from "next/server";
import {
  getAuthConfig,
  newSessionPayload,
  safeEqual,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  signSession,
} from "@/lib/auth/session";
import { checkSameOrigin, jsonError, readJson } from "@/lib/server/api";
import { getEngineDeps } from "@/lib/server/runtime";
import { loginSchema } from "@/lib/types";

// ログイン試行の制限（同一IPから1分間に5回まで）
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const cur = attempts.get(ip);
  if (!cur || cur.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  cur.count += 1;
  return cur.count > MAX_ATTEMPTS;
}

export async function POST(req: NextRequest) {
  const bad = checkSameOrigin(req);
  if (bad) return bad;
  const cfg = getAuthConfig();
  if (!cfg.ok) return jsonError(500, cfg.error);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) return jsonError(429, "ログイン試行が多すぎます。1分ほど待ってから再度お試しください。");

  let body;
  try {
    body = loginSchema.parse(await readJson(req));
  } catch {
    return jsonError(400, "入力内容が正しくありません");
  }

  let via: "demo" | "passcode";
  if (cfg.passcodeRequired) {
    if (!body.passcode || !(await safeEqual(body.passcode, process.env.CEO_PASSCODE!))) {
      return jsonError(401, "パスコードが違います");
    }
    via = "passcode";
  } else {
    via = "demo";
  }

  const token = await signSession(newSessionPayload(via), cfg.secret);
  const deps = getEngineDeps();
  await deps.store.transact((data) => {
    data.audit.push({ id: `aud_${crypto.randomUUID().slice(0, 12)}`, at: new Date().toISOString(), actor: "ceo", action: "auth.login", detail: via });
  });
  const res = NextResponse.json({ ok: true, via });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
