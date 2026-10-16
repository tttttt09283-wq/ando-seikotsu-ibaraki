import { NextResponse, type NextRequest } from "next/server";
import { decideApproval, tick } from "@/lib/engine/engine";
import { checkSameOrigin, engineErrorResponse, jsonError, readJson, requireRole, snapshotResponse } from "@/lib/server/api";
import { executeApprovedAction } from "@/lib/engine/reputation";
import { getEngineDeps, getGoogleApiIfConnected } from "@/lib/server/runtime";
import { approvalDecisionSchema } from "@/lib/types";

/**
 * 承認依頼の判断（承認・却下・修正依頼・代表へ回す・統括責任者に任せる）。
 * 誰が判断できるかはエンジン側で、承認依頼の「いま判断する人」と照合して確認する。
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const bad = checkSameOrigin(req);
  if (bad) return bad;
  const actor = await requireRole(req, ["operator", "president"]);
  if (actor instanceof NextResponse) return actor;
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
    return jsonError(400, "修正してほしい内容を入力してください");
  }

  try {
    const deps = getEngineDeps();
    const a = await decideApproval(deps, id, actor.memberId, input.decision, input.comment);
    // 承認された外部への書き込み（口コミへの返信など）は、ここで実行する
    if (a.status === "APPROVED" && a.payload) await executeApprovedAction(deps, id, await getGoogleApiIfConnected());
    await tick(deps);
    return await snapshotResponse(actor);
  } catch (e) {
    return engineErrorResponse(e);
  }
}
