import { NextResponse, type NextRequest } from "next/server";
import { tick } from "@/lib/engine/engine";
import { engineErrorResponse, requireRole, snapshotResponse } from "@/lib/server/api";
import { getEngineDeps } from "@/lib/server/runtime";

export const dynamic = "force-dynamic";

/** 会社の現在の状態。呼ばれるたびに期限が来た仕事を進めてから返す（代表には自分宛ての承認だけを返す） */
export async function GET(req: NextRequest) {
  const actor = await requireRole(req, ["operator", "president"]);
  if (actor instanceof NextResponse) return actor;
  try {
    await tick(getEngineDeps());
    return await snapshotResponse(actor);
  } catch (e) {
    return engineErrorResponse(e);
  }
}
