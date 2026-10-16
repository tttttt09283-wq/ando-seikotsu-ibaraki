import { moveKpi, recordKpiValue, removeKpi, resetKpis, saveKpi } from "@/lib/engine/planning";
import { operatorPost } from "@/lib/server/route-helpers";
import { getEngineDeps } from "@/lib/server/runtime";
import { kpiInputSchema } from "@/lib/types";

/** 管理項目（KPI）の追加・変更・並べ替え・手入力の値（統括責任者のみ） */
export const POST = operatorPost(kpiInputSchema, async (input, actor) => {
  const deps = getEngineDeps();
  switch (input.action) {
    case "save":
      return { kpiId: (await saveKpi(deps, actor.memberId, input.def)).id };
    case "remove":
      return void (await removeKpi(deps, actor.memberId, input.id));
    case "move":
      return void (await moveKpi(deps, actor.memberId, input.id, input.dir));
    case "reset":
      return void (await resetKpis(deps, actor.memberId));
    case "value":
      return void (await recordKpiValue(deps, actor.memberId, input));
  }
});
