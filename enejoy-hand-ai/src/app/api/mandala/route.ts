import { createMandala, removeMandala, updateMandala } from "@/lib/engine/mandala";
import { operatorPost } from "@/lib/server/route-helpers";
import { getEngineDeps } from "@/lib/server/runtime";
import { mandalaInputSchema } from "@/lib/types";

/** マンダラチャートの作成・編集・削除（統括責任者のみ） */
export const POST = operatorPost(
  mandalaInputSchema,
  async (input, actor) => {
    const deps = getEngineDeps();
    if (input.action === "create") return { chartId: (await createMandala(deps, actor.memberId, input)).id };
    if (input.action === "update") {
      const { action: _a, ...rest } = input;
      void _a;
      return { chartId: (await updateMandala(deps, actor.memberId, rest)).id };
    }
    await removeMandala(deps, actor.memberId, input.id);
  },
  { maxBytes: 200_000 },
);
