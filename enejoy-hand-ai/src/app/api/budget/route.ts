import { discardBudgetDraft, editBudgetDraft, fillBudgetStandard, requestBudgetConfirm } from "@/lib/engine/budget";
import { operatorPost } from "@/lib/server/route-helpers";
import { getEngineDeps } from "@/lib/server/runtime";
import { budgetInputSchema } from "@/lib/types";

/** 院別売上予算：案の編集・基準額で埋める・破棄・確定の承認依頼（統括責任者のみ） */
export const POST = operatorPost(budgetInputSchema, async (input, actor) => {
  const deps = getEngineDeps();
  switch (input.action) {
    case "edit":
      await editBudgetDraft(deps, actor.memberId, { cells: input.cells, standardJpy: input.standardJpy });
      return;
    case "fill_standard":
      await fillBudgetStandard(deps, actor.memberId, input.standardJpy);
      return;
    case "discard":
      await discardBudgetDraft(deps, actor.memberId);
      return;
    case "request": {
      const a = await requestBudgetConfirm(deps, actor.memberId, input.note);
      return { approvalId: a.id };
    }
  }
});

