import { NextResponse, type NextRequest } from "next/server";

/** 別サイトからの送信（CSRF）を拒否する：JSON かつ同一オリジンのみ受け付ける */
export function rejectCrossSite(request: NextRequest): NextResponse | null {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 415 });
  }
  // 別サイトからの送信を拒否する。比較は実際に受けたホスト名で行う（独自ドメイン・プロキシ経由でも同じ判定になるように）
  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (!host || originHost !== host) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
  }
  return null;
}
