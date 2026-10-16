import { z } from "zod";
import { addCompetitor, refreshCompetitors, removeCompetitor } from "@/lib/engine/reputation";
import { EngineError } from "@/lib/engine/engine";
import { operatorPost } from "@/lib/server/route-helpers";
import { getEngineDeps, getPlacesApi } from "@/lib/server/runtime";
import { competitorInputSchema } from "@/lib/types";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), competitor: competitorInputSchema }),
  z.object({ action: z.literal("remove"), id: z.string().min(1).max(60) }),
  z.object({ action: z.literal("refresh") }),
]);

/** 地域の競合の登録・削除・最新の星と口コミ件数の取得 */
export const POST = operatorPost(schema, async (input, actor) => {
  const deps = getEngineDeps();
  if (input.action === "add") {
    const places = getPlacesApi();
    // Places の店舗なら、登録時に最新の星・件数も取る（取得分は30日だけ保存）
    const place = places && input.competitor.placeId ? await places.details(input.competitor.placeId).catch(() => undefined) : undefined;
    const c = await addCompetitor(deps, actor.memberId, input.competitor, place);
    return { id: c.id };
  }
  if (input.action === "remove") {
    await removeCompetitor(deps, actor.memberId, input.id);
    return;
  }
  const places = getPlacesApi();
  if (!places) throw new EngineError("Places APIのキー（GOOGLE_MAPS_API_KEY）が設定されていません", "INVALID_STATE");
  return { refresh: await refreshCompetitors(deps, places, { actorId: actor.memberId }) };
});
