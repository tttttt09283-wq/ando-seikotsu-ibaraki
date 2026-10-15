import { NextResponse, type NextRequest } from "next/server";
import { decideApproval, tick } from "@/lib/engine/engine";
import { checkSameOrigin, engineErrorResponse, jsonError, readJson, requireCeo, snapshotResponse } from "@/lib/server/api";
import { getEngineDeps } from "@/lib/server/runtime";
import { approvalDecisionSchema } from "@/lib/types";

/** HUMAN APPROVAL：CEOが承認・却下・修正依頼を行う */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const bad = checkSameOrigin(req);
  if (bad) return bad;
  const session = await requireCeo(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  if (!/^apv_[a-z0-9]{12}$/.test(id)) return jsonError(400, "承認IDが正しくありません");

  let input;
  try {
    const parsed = approvalDecisionSchema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError(400, "入力内容が正しくありません");
    input = parsed.data;
  } catch {
    return jsonError(400, "入力内容が正しくありません");
  }
  if (input.decision === "CHANGES_REQUESTED" && !input.comment) {
    return jsonError(400, "修正依頼の内容を入力してください");
  }

  try {
    const deps = getEngineDeps();
    await decideApproval(deps, id, input.decision, input.comment);
    await tick(deps);
    return await snapshotResponse();
  } catch (e) {
    return engineErrorResponse(e);
  }
}
