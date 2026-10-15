import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthConfig, SESSION_COOKIE, verifySession, type SessionPayload } from "@/lib/auth/session";
import { EngineError } from "@/lib/engine/engine";
import { getEngineDeps, getRuntimeInfo } from "./runtime";
import { buildSnapshot } from "@/lib/view";

export function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * API 共通の認証チェック。proxy.ts でも確認しているが、
 * 各 API でも必ず再確認する（多層防御）。
 */
export async function requireCeo(req: NextRequest): Promise<SessionPayload | NextResponse> {
  const cfg = getAuthConfig();
  if (!cfg.ok) return jsonError(500, cfg.error);
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, cfg.secret);
  if (!session) return jsonError(401, "ログインが必要です");
  if (cfg.passcodeRequired && session.via !== "passcode") return jsonError(401, "パスコードでのログインが必要です");
  return session;
}

/** 状態を変更するリクエストは同一オリジンからのみ受け付ける（CSRF対策） */
export function checkSameOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin) return null; // 同一オリジンのfetchではOriginが付かないブラウザもあるため、SameSite=Lax Cookieと併用
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) return jsonError(403, "不正なリクエスト元です");
  } catch {
    return jsonError(403, "不正なリクエスト元です");
  }
  return null;
}

export async function snapshotResponse(status = 200, extra?: Record<string, unknown>) {
  const deps = getEngineDeps();
  const runtime = getRuntimeInfo();
  const data = await deps.store.read();
  const snapshot = buildSnapshot(data, runtime.mode, deps.now(), deps.limits);
  return NextResponse.json({ snapshot, runtime, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export function engineErrorResponse(e: unknown) {
  if (e instanceof EngineError) {
    const status = { HALTED: 423, LIMIT: 429, NOT_FOUND: 404, INVALID_STATE: 409 }[e.code];
    return jsonError(status, e.message, { code: e.code });
  }
  console.error("[ait] unexpected error", e);
  return jsonError(500, "サーバーでエラーが発生しました。時間をおいて再度お試しください。");
}

export async function readJson(req: NextRequest): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 10_000) throw new Error("payload too large");
  return req.json();
}
