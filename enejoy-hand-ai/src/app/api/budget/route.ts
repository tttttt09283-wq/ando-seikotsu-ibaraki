import { NextResponse, type NextRequest } from "next/server";
import {
  applyStaffing,
  discardBudgetDraft,
  editBudgetDraft,
  fillBudgetStandard,
  importBudget,
  requestBudgetConfirm,
} from "@/lib/engine/budget";
import { parseCsv } from "@/lib/import/csv";
import { checkSameOrigin, engineErrorResponse, jsonError, requireRole, snapshotResponse } from "@/lib/server/api";
import { getEngineDeps } from "@/lib/server/runtime";
import { budgetInputSchema } from "@/lib/types";

/** 院別売上予算：案の編集・人員から計算・予算表の取り込み・基準額で埋める・破棄・確定の承認依頼（統括責任者のみ） */
export async function POST(req: NextRequest) {
  const bad = checkSameOrigin(req);
  if (bad) return bad;
  const actor = await requireRole(req, ["operator"]);
  if (actor instanceof NextResponse) return actor;
  let input;
  try {
    if (Number(req.headers.get("content-length") ?? 0) > 2_500_000) return jsonError(413, "ファイルが大きすぎます");
    const parsed = budgetInputSchema.safeParse(await req.json());
    if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "入力内容が正しくありません");
    input = parsed.data;
  } catch {
    return jsonError(400, "入力内容が正しくありません");
  }
  try {
    const deps = getEngineDeps();
    let extra: Record<string, unknown> | undefined;
    switch (input.action) {
      case "edit":
        await editBudgetDraft(deps, actor.memberId, { cells: input.cells, standardJpy: input.standardJpy, perStaffJpy: input.perStaffJpy });
        break;
      case "fill_standard":
        await fillBudgetStandard(deps, actor.memberId, input.standardJpy);
        break;
      case "apply_staff":
        extra = { result: await applyStaffing(deps, actor.memberId, { perStaffJpy: input.perStaffJpy, clinicIds: input.clinicIds }) };
        break;
      case "import":
        extra = { result: await importBudget(deps, actor.memberId, { grid: parseCsv(input.csv), unit: input.unit, label: input.fileName }) };
        break;
      case "discard":
        await discardBudgetDraft(deps, actor.memberId);
        break;
      case "request":
        extra = { approvalId: (await requestBudgetConfirm(deps, actor.memberId, input.note)).id };
        break;
    }
    return await snapshotResponse(actor, 200, extra);
  } catch (e) {
    return engineErrorResponse(e);
  }
}
