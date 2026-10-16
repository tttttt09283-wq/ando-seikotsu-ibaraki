import { createScenario, removeScenario, requestPlanAdopt, updateScenario } from "@/lib/engine/planning";
import { operatorPost } from "@/lib/server/route-helpers";
import { getEngineDeps } from "@/lib/server/runtime";
import { planInputSchema } from "@/lib/types";

/** 中期事業計画のシナリオの作成・編集・削除・採用の承認依頼（統括責任者のみ） */
export const POST = operatorPost(planInputSchema, async (input, actor) => {
  const deps = getEngineDeps();
  switch (input.action) {
    case "create":
      return { scenarioId: (await createScenario(deps, actor.memberId, input)).id };
    case "update": {
      const { action: _a, ...rest } = input;
      void _a;
      return { scenarioId: (await updateScenario(deps, actor.memberId, rest)).id };
    }
    case "remove":
      return void (await removeScenario(deps, actor.memberId, input.id));
    case "request_adopt":
      return { approvalId: (await requestPlanAdopt(deps, actor.memberId, input)).id };
  }
}, { maxBytes: 100_000 });
