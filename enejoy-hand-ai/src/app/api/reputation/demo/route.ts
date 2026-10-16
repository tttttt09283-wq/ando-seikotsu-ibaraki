import { z } from "zod";
import { loadDemoReputation } from "@/lib/engine/reputation";
import { operatorPost } from "@/lib/server/route-helpers";
import { getEngineDeps } from "@/lib/server/runtime";

/** 口コミ・競合のデモデータ（架空）を作る。本番の記録には触れない */
export const POST = operatorPost(z.object({}).passthrough(), async (_input, actor) => {
  await loadDemoReputation(getEngineDeps(), actor.memberId);
});
