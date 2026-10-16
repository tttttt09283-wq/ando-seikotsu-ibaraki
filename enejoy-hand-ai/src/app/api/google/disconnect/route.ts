import { NextResponse, type NextRequest } from "next/server";
import { markGoogleDisconnected } from "@/lib/engine/reputation";
import { disconnect } from "@/lib/google/oauth";
import { checkSameOrigin, engineErrorResponse, requireRole, snapshotResponse } from "@/lib/server/api";
import { getEngineDeps } from "@/lib/server/runtime";

/** Googleアカウントとの接続を解除する（取得済みの口コミ・数字は残す） */
export async function POST(req: NextRequest) {
  const bad = checkSameOrigin(req);
  if (bad) return bad;
  const actor = await requireRole(req, ["operator"]);
  if (actor instanceof NextResponse) return actor;
  try {
    await disconnect();
    await markGoogleDisconnected(getEngineDeps(), actor.memberId);
    return await snapshotResponse(actor);
  } catch (e) {
    return engineErrorResponse(e);
  }
}
