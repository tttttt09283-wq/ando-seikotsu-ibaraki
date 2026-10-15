import { NextResponse, type NextRequest } from "next/server";
import { resetDemoData } from "@/lib/engine/engine";
import { checkSameOrigin, engineErrorResponse, requireCeo, snapshotResponse } from "@/lib/server/api";
import { getEngineDeps } from "@/lib/server/runtime";

/** デモデータの初期化（本番データ・監査ログは残る） */
export async function POST(req: NextRequest) {
  const bad = checkSameOrigin(req);
  if (bad) return bad;
  const session = await requireCeo(req);
  if (session instanceof NextResponse) return session;
  try {
    await resetDemoData(getEngineDeps());
    return await snapshotResponse();
  } catch (e) {
    return engineErrorResponse(e);
  }
}
