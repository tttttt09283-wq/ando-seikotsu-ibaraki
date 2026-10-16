import { NextResponse, type NextRequest } from "next/server";
import { submitCommand, tick } from "@/lib/engine/engine";
import { checkSameOrigin, engineErrorResponse, jsonError, readJson, requireRole, snapshotResponse } from "@/lib/server/api";
import { getEngineDeps } from "@/lib/server/runtime";
import { commandInputSchema } from "@/lib/types";

/** 司令塔への指示を受け付ける（統括責任者のみ） */
export async function POST(req: NextRequest) {
  const bad = checkSameOrigin(req);
  if (bad) return bad;
  const actor = await requireRole(req, ["operator"]);
  if (actor instanceof NextResponse) return actor;

  let input;
  try {
    const parsed = commandInputSchema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "入力内容が正しくありません");
    input = parsed.data;
  } catch {
    return jsonError(400, "入力内容が正しくありません");
  }

  try {
    const deps = getEngineDeps();
    const { command, duplicate } = await submitCommand(deps, input);
    await tick(deps);
    return await snapshotResponse(actor, duplicate ? 200 : 201, { commandId: command.id, duplicate });
  } catch (e) {
    return engineErrorResponse(e);
  }
}
