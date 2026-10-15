import { NextResponse, type NextRequest } from "next/server";
import { resumeOperations } from "@/lib/engine/engine";
import { checkSameOrigin, engineErrorResponse, requireCeo, snapshotResponse } from "@/lib/server/api";
import { getEngineDeps } from "@/lib/server/runtime";

/** 安全停止の解除（CEOのみ） */
export async function POST(req: NextRequest) {
  const bad = checkSameOrigin(req);
  if (bad) return bad;
  const session = await requireCeo(req);
  if (session instanceof NextResponse) return session;
  try {
    await resumeOperations(getEngineDeps());
    return await snapshotResponse();
  } catch (e) {
    return engineErrorResponse(e);
  }
}
