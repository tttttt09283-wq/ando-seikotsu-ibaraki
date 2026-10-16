import { NextResponse, type NextRequest } from "next/server";
import { recordManual } from "@/lib/engine/engine";
import { checkSameOrigin, engineErrorResponse, jsonError, readJson, requireRole, snapshotResponse } from "@/lib/server/api";
import { getEngineDeps } from "@/lib/server/runtime";
import { manualInputSchema } from "@/lib/types";

/** 院の数字の手入力（日計表がない月・院の補完用）。変更は監査ログに残る */
export async function POST(req: NextRequest) {
  const bad = checkSameOrigin(req);
  if (bad) return bad;
  const actor = await requireRole(req, ["operator"]);
  if (actor instanceof NextResponse) return actor;
  let input;
  try {
    const parsed = manualInputSchema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "入力内容が正しくありません");
    input = parsed.data;
  } catch {
    return jsonError(400, "入力内容が正しくありません");
  }
  try {
    await recordManual(getEngineDeps(), actor.memberId, input);
    return await snapshotResponse(actor);
  } catch (e) {
    return engineErrorResponse(e);
  }
}
