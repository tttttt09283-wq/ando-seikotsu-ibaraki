import { NextResponse, type NextRequest } from "next/server";
import { recordSales } from "@/lib/engine/engine";
import { checkSameOrigin, engineErrorResponse, jsonError, readJson, requireRole, snapshotResponse } from "@/lib/server/api";
import { getEngineDeps } from "@/lib/server/runtime";
import { salesInputSchema } from "@/lib/types";

/** 部門別の売上実績を手入力する（同じ月・部門は上書き。変更は監査ログに残る） */
export async function POST(req: NextRequest) {
  const bad = checkSameOrigin(req);
  if (bad) return bad;
  const actor = await requireRole(req, ["operator"]);
  if (actor instanceof NextResponse) return actor;

  let input;
  try {
    const parsed = salesInputSchema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "入力内容が正しくありません");
    input = parsed.data;
  } catch {
    return jsonError(400, "入力内容が正しくありません");
  }
  try {
    await recordSales(getEngineDeps(), actor.memberId, input);
    return await snapshotResponse(actor);
  } catch (e) {
    return engineErrorResponse(e);
  }
}
