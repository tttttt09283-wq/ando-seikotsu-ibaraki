import { NextResponse, type NextRequest } from "next/server";
import { setSheetSource, syncSheets } from "@/lib/engine/engine";
import { fetchSheetGrid } from "@/lib/import/google-sheets";
import { checkSameOrigin, engineErrorResponse, jsonError, readJson, requireRole, snapshotResponse } from "@/lib/server/api";
import { getEngineDeps } from "@/lib/server/runtime";
import { sheetInputSchema } from "@/lib/types";

/** 月ごとの日計表（スプレッドシート）の登録・解除。登録したらすぐに1回読み取る */
export async function POST(req: NextRequest) {
  const bad = checkSameOrigin(req);
  if (bad) return bad;
  const actor = await requireRole(req, ["operator"]);
  if (actor instanceof NextResponse) return actor;
  let input;
  try {
    const parsed = sheetInputSchema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "入力内容が正しくありません");
    input = parsed.data;
  } catch {
    return jsonError(400, "入力内容が正しくありません");
  }
  try {
    const deps = getEngineDeps();
    await setSheetSource(deps, actor.memberId, input);
    const sync = input.url ? await syncSheets(deps, fetchSheetGrid, { months: [input.month], actorId: actor.memberId }) : [];
    return await snapshotResponse(actor, 200, { sync });
  } catch (e) {
    return engineErrorResponse(e);
  }
}
