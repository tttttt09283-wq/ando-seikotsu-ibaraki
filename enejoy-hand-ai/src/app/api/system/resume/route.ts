import { NextResponse, type NextRequest } from "next/server";
import { resumeOperations } from "@/lib/engine/engine";
import { checkSameOrigin, engineErrorResponse, requireRole, snapshotResponse } from "@/lib/server/api";
import { getEngineDeps } from "@/lib/server/runtime";

/** 安全停止の解除（統括責任者のみ） */
export async function POST(req: NextRequest) {
  const bad = checkSameOrigin(req);
  if (bad) return bad;
  const actor = await requireRole(req, ["operator"]);
  if (actor instanceof NextResponse) return actor;
  try {
    await resumeOperations(getEngineDeps(), actor.memberId);
    return await snapshotResponse(actor);
  } catch (e) {
    return engineErrorResponse(e);
  }
}
