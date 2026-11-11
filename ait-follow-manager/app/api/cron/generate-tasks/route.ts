import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/db/admin";
import { env } from "@/lib/env";
import { generateForAllOrganizations } from "@/lib/followup/generate";

export const maxDuration = 300;

/** Vercel Cron から毎朝実行（Authorization: Bearer CRON_SECRET） */
export async function GET(request: Request) {
  const expected = Buffer.from(`Bearer ${env().CRON_SECRET}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const results = await generateForAllOrganizations(createAdminClient());
  // 個人情報を含まない集計のみ返す
  return NextResponse.json({
    organizations: results.length,
    created: results.reduce((a, r) => a + r.created, 0),
    resolved: results.reduce((a, r) => a + r.resolved, 0),
  });
}
