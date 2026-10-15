import { NextResponse, type NextRequest } from "next/server";
import { tick } from "@/lib/engine/engine";
import { engineErrorResponse, requireCeo, snapshotResponse } from "@/lib/server/api";
import { getEngineDeps } from "@/lib/server/runtime";

export const dynamic = "force-dynamic";

/** 会社の現在の状態。呼ばれるたびに期限が来た仕事を進めてから返す。 */
export async function GET(req: NextRequest) {
  const session = await requireCeo(req);
  if (session instanceof NextResponse) return session;
  try {
    await tick(getEngineDeps());
    return await snapshotResponse();
  } catch (e) {
    return engineErrorResponse(e);
  }
}
