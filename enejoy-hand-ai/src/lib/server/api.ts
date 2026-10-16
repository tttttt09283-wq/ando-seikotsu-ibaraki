import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import {
  getAuthConfig,
  isSessionAllowed,
  SESSION_COOKIE,
  verifySession,
  type SessionPayload,
  type SessionRole,
} from "@/lib/auth/session";
import { EngineError } from "@/lib/engine/engine";
import { buildPresidentSnapshot, buildSnapshot } from "@/lib/view";
import { OPERATOR_ID, PRESIDENT_ID } from "@/tenant";
import { getEngineDeps, getRuntimeInfo } from "./runtime";

export function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export type Actor = { session: SessionPayload; memberId: string };

export function memberIdForRole(role: SessionRole): string {
  return role === "president" ? PRESIDENT_ID : OPERATOR_ID;
}

/**
 * API 共通の認証・認可チェック。proxy.ts でも確認しているが、各 API でも必ず再確認する（多層防御）。
 * roles に含まれない役割は 403。
 */
export async function requireRole(req: NextRequest, roles: SessionRole[]): Promise<Actor | NextResponse> {
  const cfg = getAuthConfig();
  if (!cfg.ok) return jsonError(500, cfg.error);
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, cfg.secret);
  if (!isSessionAllowed(session, cfg)) return jsonError(401, "ログインが必要です");
  if (!roles.includes(session.sub)) return jsonError(403, "この操作の権限がありません");
  return { session, memberId: memberIdForRole(session.sub) };
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

/** 役割に応じた画面データを返す（代表には自分宛ての承認依頼だけを返す） */
export async function snapshotResponse(actor: Actor, status = 200, extra?: Record<string, unknown>) {
  const deps = getEngineDeps();
  const runtime = getRuntimeInfo();
  const data = await deps.store.read();
  const body =
    actor.session.sub === "president"
      ? { president: buildPresidentSnapshot(data, runtime.mode, deps.now()), runtime: { mode: runtime.mode } }
      : { snapshot: buildSnapshot(data, runtime.mode, deps.now(), deps.limits), runtime };
  return NextResponse.json({ ...body, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export function engineErrorResponse(e: unknown) {
  if (e instanceof EngineError) {
    const status = { HALTED: 423, LIMIT: 429, NOT_FOUND: 404, INVALID_STATE: 409, FORBIDDEN: 403 }[e.code];
    return jsonError(status, e.message, { code: e.code });
  }
  console.error("[enejoy-hand-ai] unexpected error", e);
  return jsonError(500, "サーバーでエラーが発生しました。時間をおいて再度お試しください。");
}

export async function readJson(req: NextRequest, maxBytes = 10_000): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new Error("payload too large");
  return req.json();
}
