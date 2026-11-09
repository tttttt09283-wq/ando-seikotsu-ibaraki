// 毎日の定期処理（Vercel Cron から 9:00 JST に呼ばれる）。CRON_SECRET で呼び出し元を確かめる
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const weekly = request.nextUrl.searchParams.get("weekly");
  const db = createAdminClient().schema("mgmt");
  const { data, error } = await db.rpc("run_daily_jobs", { p_weekly: weekly === "1" ? true : null });
  if (error) {
    await db.rpc("record_job_error", { p_job: "daily", p_error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, result: data });
}
