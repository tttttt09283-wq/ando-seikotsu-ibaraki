import { recordRatingSnapshot } from "@/lib/engine/reputation";
import { operatorPost } from "@/lib/server/route-helpers";
import { getEngineDeps } from "@/lib/server/runtime";
import { snapshotInputSchema } from "@/lib/types";

/** 人が確認した星・口コミ件数を記録する（長期の推移用） */
export const POST = operatorPost(snapshotInputSchema, async (input, actor) => {
  await recordRatingSnapshot(getEngineDeps(), actor.memberId, input);
});
