import { EngineError } from "@/lib/engine/engine";
import { operatorPost } from "@/lib/server/route-helpers";
import { getPlacesApi } from "@/lib/server/runtime";
import { placesSearchSchema } from "@/lib/types";

/** 競合の候補を Google マップで検索する（結果は保存しない） */
export const POST = operatorPost(placesSearchSchema, async (input) => {
  const places = getPlacesApi();
  if (!places) throw new EngineError("Places APIのキー（GOOGLE_MAPS_API_KEY）が設定されていません。名前を手入力して登録することもできます", "INVALID_STATE");
  return { places: await places.search(input.query) };
});
