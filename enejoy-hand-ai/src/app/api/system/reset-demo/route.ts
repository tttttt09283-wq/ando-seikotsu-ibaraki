import { NextResponse, type NextRequest } from "next/server";
import { resetDemoData } from "@/lib/engine/engine";
import { checkSameOrigin, engineErrorResponse, requireRole, snapshotResponse } from "@/lib/server/api";
import { getEngineDeps } from "@/lib/server/runtime";

/** デモデータの初期化（手入力の売上実績・監査ログは残る）（統括責任者のみ） */
export async function POST(req: NextRequest) {
  const bad = checkSameOrigin(req);
  if (bad) return bad;
  const actor = await requireRole(req, ["operator"]);
  if (actor instanceof NextResponse) return actor;
  try {
    await resetDemoData(getEngineDeps(), actor.memberId);
    return await snapshotResponse(actor);
  } catch (e) {
    return engineErrorResponse(e);
  }
}
