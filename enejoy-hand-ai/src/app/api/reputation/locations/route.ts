import { setLocationClinic } from "@/lib/engine/reputation";
import { operatorPost } from "@/lib/server/route-helpers";
import { getEngineDeps } from "@/lib/server/runtime";
import { locationMapSchema } from "@/lib/types";

/** Googleのプロフィール（ロケーション）と院の対応付け */
export const POST = operatorPost(locationMapSchema, async (input, actor) => {
  await setLocationClinic(getEngineDeps(), actor.memberId, input.locationName, input.clinicId);
});
