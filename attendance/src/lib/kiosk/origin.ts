import { NextResponse, type NextRequest } from "next/server";

/** 別サイトからの送信（CSRF）を拒否する：JSON かつ同一オリジンのみ受け付ける */
export function rejectCrossSite(request: NextRequest): NextResponse | null {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 415 });
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  return null;
}

/**
 * 別サイトからの送信でないか。比較は実際に受けたホスト名で行う（独自ドメイン・プロキシ経由でも同じ判定になるように）。
 * Origin ヘッダーが無い場合（同一オリジンの古いブラウザ等）は許可する
 */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    originHost = null;
  }
  return Boolean(host) && originHost === host;
}
