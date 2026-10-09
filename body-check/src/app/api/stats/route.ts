/**
 * 匿名統計の受け口（API）
 * 現在は保存先データベースを持たないため、Vercel のログに1行のJSONとして記録します。
 * 将来、管理画面で集計する際は、ここでデータベース（例：Supabase、Vercel Postgres）に保存する処理を追加します。
 */
import { NextResponse } from "next/server";
import { validateStatsEvent } from "@/lib/stats";

const MAX_BODY_BYTES = 4 * 1024;

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_STATS_ENABLED !== "true") {
    return NextResponse.json({ ok: false, reason: "disabled" }, { status: 404 });
  }

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, reason: "too_large" }, { status: 413 });
    }
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }

  const event = validateStatsEvent(raw);
  if (!event) {
    return NextResponse.json({ ok: false, reason: "invalid_payload" }, { status: 400 });
  }

  // 回答日時はサーバー側で付与（端末の時計のずれの影響を受けないように）
  console.log(JSON.stringify({ kind: "body-check-stats", receivedAt: new Date().toISOString(), ...event }));

  return NextResponse.json({ ok: true });
}
